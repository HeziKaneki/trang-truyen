import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
vi.mock('@/server/auth', () => ({ auth: vi.fn() }));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
import { db } from '@/server/db';
import { redis } from '@/server/redis';
import { queue } from '@/server/jobs/queue';
import { register, consumeToken, requestToken } from '@/server/services/accounts';
import {
  saveStory,
  createChapter,
  saveChapter,
  setPublication,
  publishChapter,
  restoreVersion,
  reorderChapters,
} from '@/server/services/stories';
import { vote, follow, createComment } from '@/server/services/social';
import { countRead, flushCounters } from '@/server/services/counters';
import { browse, browseInput } from '@/server/services/discovery';
import { chapterNotifications } from '@/server/services/notifications';
import { moderate, createReport } from '@/server/services/moderation';
import { rateLimit, tokenHash, type Actor } from '@/server/security';
import { verify } from 'argon2';
let author: Actor;
let reader: Actor;
let moderator: Actor;
let categoryId: string;
let storyId: string;
let chapterId: string;
beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes('_test'))
    throw new Error('Integration tests require a dedicated database name containing _test');
  await db.$connect();
  await redis().ping();
  const suffix = Date.now();
  author = await db.user.create({
    data: {
      username: `testauthor${suffix}`,
      email: `author${suffix}@example.com`,
      emailVerified: new Date(),
      birthDate: new Date('1990-01-01'),
    },
  });
  reader = await db.user.create({
    data: {
      username: `testreader${suffix}`,
      email: `reader${suffix}@example.com`,
      emailVerified: new Date(),
    },
  });
  moderator = await db.user.create({
    data: { username: `testmod${suffix}`, role: 'MODERATOR', emailVerified: new Date() },
  });
  categoryId = (
    await db.category.create({ data: { name: 'Test category', slug: `test-${suffix}` } })
  ).id;
});
afterAll(async () => {
  if (author) {
    await db.moderationAction.deleteMany({ where: { moderatorId: moderator.id } });
    await db.story.deleteMany({ where: { authorId: author.id } });
    await db.user.deleteMany({ where: { id: { in: [author.id, reader.id, moderator.id] } } });
    await db.category.deleteMany({ where: { id: categoryId } });
  }
  await queue().close();
  await redis().quit();
  await db.$disconnect();
});
describe.sequential('real Postgres and Redis workflows', () => {
  it('registers, hashes password, consumes verification once, resets password', async () => {
    const email = `auth${Date.now()}@example.com`;
    await register({
      email,
      password: 'strong-test-password',
      username: `auth${Date.now()}`,
      name: 'Test User',
      birthDate: new Date('1990-01-01'),
      terms: true,
    });
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(await verify(user.passwordHash!, 'strong-test-password')).toBe(true);
    expect(user.emailVerified).toBeNull();
    const token = 'a'.repeat(64);
    await db.emailToken.create({
      data: {
        userId: user.id,
        type: 'VERIFY',
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + 10000),
      },
    });
    await consumeToken({ token }, false);
    await expect(consumeToken({ token }, false)).rejects.toThrow('INVALID_TOKEN');
    await requestToken(email, 'RESET');
    const reset = 'b'.repeat(64);
    await db.emailToken.create({
      data: {
        userId: user.id,
        type: 'RESET',
        tokenHash: tokenHash(reset),
        expiresAt: new Date(Date.now() + 10000),
      },
    });
    await consumeToken({ token: reset, password: 'new-strong-password' }, true);
    expect(
      await verify(
        (await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash!,
        'new-strong-password',
      ),
    ).toBe(true);
    await db.user.delete({ where: { id: user.id } });
  });
  it('creates a story, rejects IDOR and saves revisions with conflict detection', async () => {
    const story = await saveStory(author, {
      title: 'Mùa hạ Hà Nội',
      description: 'Một câu chuyện về thành phố và tình bạn.',
      categoryId,
      language: 'vi',
      status: 'ONGOING',
      mature: false,
      copyright: 'ALL_RIGHTS_RESERVED',
      tags: ['chữa lành'],
    });
    storyId = story.id;
    const chapter = await createChapter(author, storyId, 'Chương đầu');
    chapterId = chapter.id;
    await expect(
      saveChapter(reader, chapterId, { title: 'Hack', html: '<p>x</p>', revision: 0 }),
    ).rejects.toThrow('FORBIDDEN');
    const saved = await saveChapter(author, chapterId, {
      title: 'Chương đầu',
      html: '<p>Hà Nội có những ngày thật đẹp.</p>',
      revision: 0,
    });
    expect(saved.revision).toBe(1);
    await expect(
      saveChapter(author, chapterId, { title: 'Stale', html: '<p>x</p>', revision: 0 }),
    ).rejects.toThrow('VERSION_CONFLICT');
  });
  it('schedules then publishes, and search ranks accented and unaccented queries identically', async () => {
    const scheduled = await setPublication(author, chapterId, {
      status: 'SCHEDULED',
      publishAt: new Date(Date.now() + 3600000),
    });
    expect(scheduled.status).toBe('SCHEDULED');
    expect((await publishChapter(chapterId, author)).status).toBe('PUBLISHED');
    const a = await browse(browseInput.parse({ q: 'Mùa hạ Hà Nội' }));
    const b = await browse(browseInput.parse({ q: 'Mua ha Ha Noi' }));
    expect(a.stories[0]?.id).toBe(storyId);
    expect(b.stories[0]?.id).toBe(storyId);
  });
  it('enforces vote uniqueness under concurrency and read dedupe with durable flush', async () => {
    await Promise.all(Array.from({ length: 8 }, () => vote(reader, 'story', storyId, true)));
    expect(await db.storyVote.count({ where: { storyId, userId: reader.id } })).toBe(1);
    const counted = await Promise.all(
      Array.from({ length: 8 }, () => countRead(reader.id, chapterId, storyId)),
    );
    expect(counted.reduce((a, b) => a + b, 0)).toBe(1);
    await flushCounters();
    await flushCounters();
    expect((await db.chapter.findUniqueOrThrow({ where: { id: chapterId } })).reads).toBe(1);
  });
  it('rate limits atomically and sends deduplicated follower notifications', async () => {
    const key = `test:${Date.now()}`;
    await rateLimit(key, 2);
    await rateLimit(key, 2);
    await expect(rateLimit(key, 2)).rejects.toThrow('RATE_LIMITED');
    await follow(reader, author.id, true);
    await chapterNotifications(chapterId, 1);
    await chapterNotifications(chapterId, 1);
    expect(await db.notification.count({ where: { userId: reader.id, type: 'CHAPTER' } })).toBe(1);
    const c = await createComment(reader, chapterId, { body: 'Một chương rất hay.' });
    await createComment(author, chapterId, { body: 'Cảm ơn bạn!', parentId: c.id });
    expect(await db.notification.count({ where: { userId: reader.id, type: 'REPLY' } })).toBe(1);
  });
  it('keeps only 30 versions, restores and validates chapter ordering', async () => {
    let revision = 1;
    for (let i = 0; i < 33; i++) {
      const c = await saveChapter(author, chapterId, {
        title: 'Chương đầu',
        html: `<p>Bản viết ${i}.</p>`,
        revision,
      });
      revision = c.revision;
    }
    const versions = await db.chapterVersion.findMany({
      where: { chapterId },
      orderBy: { revision: 'desc' },
    });
    expect(versions).toHaveLength(30);
    const restored = await restoreVersion(author, chapterId, versions[0].id);
    expect(restored.html).toBe(versions[0].html);
    await expect(reorderChapters(reader, storyId, [chapterId])).rejects.toThrow('FORBIDDEN');
    await expect(reorderChapters(author, storyId, [])).rejects.toThrow('INVALID_ORDER');
    await reorderChapters(author, storyId, [chapterId]);
  });
  it('routes banned content to review, permits moderation and hides reported stories', async () => {
    await db.bannedWord.create({ data: { word: `testbanned${author.id}` } });
    const chapter = await db.chapter.findUniqueOrThrow({ where: { id: chapterId } });
    await saveChapter(author, chapterId, {
      title: chapter.title,
      html: `<p>testbanned${author.id}</p>`,
      revision: chapter.revision,
    });
    expect((await publishChapter(chapterId, author)).status).toBe('REVIEW');
    await moderate(moderator, {
      targetType: 'CHAPTER',
      targetId: chapterId,
      action: 'APPROVE',
      note: 'Approved after manual review',
    });
    const report = await createReport(reader, {
      targetType: 'STORY',
      targetId: storyId,
      reason: 'OTHER',
      note: 'Please review this story.',
    });
    await moderate(moderator, {
      targetType: 'STORY',
      targetId: storyId,
      reportId: report.id,
      action: 'HIDE',
      note: 'Hidden for investigation',
    });
    expect((await db.story.findUniqueOrThrow({ where: { id: storyId } })).hiddenAt).not.toBeNull();
    expect(
      (await browse(browseInput.parse({ q: 'Mua ha Ha Noi' }))).stories.some(
        (s) => s.id === storyId,
      ),
    ).toBe(false);
    await db.bannedWord.deleteMany({ where: { word: `testbanned${author.id}` } });
  });
});
