import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { revalidateTag } from 'next/cache';
import { db } from '../db';
import { authorize, canMature, tokenHash, type Actor } from '../security';
import { AppError } from '../errors';
import { content } from '../sanitize';
import { normalize, slugify } from '@/lib/utils';
import { queue } from '../jobs/queue';
export const storyInput = z.object({
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().min(10).max(5000),
  categoryId: z.string().cuid(),
  language: z.enum(['vi', 'en']),
  status: z.enum(['ONGOING', 'COMPLETED', 'HIATUS']),
  mature: z.boolean(),
  copyright: z.enum(['ALL_RIGHTS_RESERVED', 'CC_BY', 'CC_BY_NC', 'PUBLIC_DOMAIN']),
  cover: z
    .string()
    .regex(/^\/uploads\/[a-f0-9-]+\.webp$/)
    .nullable()
    .optional(),
  tags: z.array(z.string().trim().min(2).max(30)).max(10),
});
export const chapterInput = z.object({
  title: z.string().trim().min(1).max(180),
  html: z.string().max(500_000),
  revision: z.number().int().min(0),
});
export const publicationInput = z.object({
  status: z.enum(['DRAFT', 'PUBLISHED', 'SCHEDULED']),
  publishAt: z.coerce.date().optional(),
});
export function publicWhere(mature = false): Prisma.StoryWhereInput {
  return {
    published: true,
    hiddenAt: null,
    deletedAt: null,
    ...(mature ? {} : { mature: false }),
    author: {
      deletedAt: null,
      bannedAt: null,
      OR: [{ suspendedUntil: null }, { suspendedUntil: { lte: new Date() } }],
    },
  };
}
export async function readableStory(id: string, user: Actor | null, guest = false) {
  const story = await db.story.findFirst({ where: { id, ...publicWhere(canMature(user, guest)) } });
  if (!story) throw new AppError('NOT_FOUND', 404);
  return story;
}
export async function readableChapter(id: string, user: Actor | null, guest = false) {
  const chapter = await db.chapter.findFirst({
    where: {
      id,
      status: 'PUBLISHED',
      deletedAt: null,
      hiddenAt: null,
      story: publicWhere(canMature(user, guest)),
    },
    include: { story: true },
  });
  if (!chapter) throw new AppError('NOT_FOUND', 404);
  return chapter;
}
export async function ownStory(user: Actor, id: string, deleted = false) {
  const story = await db.story.findUnique({ where: { id } });
  if (!story || (!deleted && story.deletedAt)) throw new AppError('NOT_FOUND', 404);
  authorize(user, { ownerId: story.authorId });
  return story;
}
export async function ownChapter(user: Actor, id: string, deleted = false) {
  const chapter = await db.chapter.findUnique({ where: { id }, include: { story: true } });
  if (!chapter || (!deleted && (chapter.deletedAt || chapter.story.deletedAt)))
    throw new AppError('NOT_FOUND', 404);
  authorize(user, { ownerId: chapter.story.authorId });
  return chapter;
}
export function invalidateStories() {
  revalidateTag('stories');
}
export async function saveStory(user: Actor, input: z.infer<typeof storyInput>, id?: string) {
  authorize(user);
  if (id) await ownStory(user, id);
  if (
    input.cover &&
    !(await db.uploadedFile.findFirst({ where: { userId: user.id, url: input.cover } }))
  )
    throw new AppError('INVALID_UPLOAD');
  if (input.mature && !canMature({ ...user, allowMature: true }))
    throw new AppError('AGE_RESTRICTED', 403);
  const { tags, ...fields } = input;
  const result = await db.$transaction(async (tx) => {
    const story = id
      ? await tx.story.update({ where: { id }, data: fields })
      : await tx.story.create({
          data: {
            ...fields,
            authorId: user.id,
            slug: `${slugify(input.title).slice(0, 100)}-${randomBytes(3).toString('hex')}`,
          },
        });
    await tx.storyTag.deleteMany({ where: { storyId: story.id } });
    for (const label of [...new Set(tags.map((t) => t.toLowerCase()))]) {
      const slug = slugify(label);
      if (!slug) continue;
      const tag = await tx.tag.upsert({
        where: { slug },
        create: { name: label, slug },
        update: {},
      });
      await tx.storyTag.upsert({
        where: { storyId_tagId: { storyId: story.id, tagId: tag.id } },
        create: { storyId: story.id, tagId: tag.id },
        update: {},
      });
    }
    return story;
  });
  invalidateStories();
  return result;
}
export async function createChapter(user: Actor, storyId: string, title: string) {
  await ownStory(user, storyId);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Story" WHERE id = ${storyId} FOR UPDATE`;
    const last = await tx.chapter.aggregate({ where: { storyId }, _max: { number: true } });
    return tx.chapter.create({ data: { storyId, title, number: (last._max.number ?? 0) + 1 } });
  });
}
export async function saveChapter(user: Actor, id: string, input: z.infer<typeof chapterInput>) {
  const previous = await ownChapter(user, id);
  const clean = content(input.html);
  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Chapter" WHERE id = ${id} FOR UPDATE`;
    const current = await tx.chapter.findUniqueOrThrow({ where: { id } });
    if (current.revision !== input.revision) throw new AppError('VERSION_CONFLICT', 409);
    if (current.html === clean.html && current.title === input.title) return current;
    await tx.chapterVersion.create({
      data: { chapterId: id, title: current.title, html: current.html, revision: current.revision },
    });
    const old = await tx.chapterVersion.findMany({
      where: { chapterId: id },
      orderBy: { revision: 'desc' },
      skip: 30,
      select: { id: true },
    });
    if (old.length)
      await tx.chapterVersion.deleteMany({ where: { id: { in: old.map((v) => v.id) } } });
    // Editing a published chapter requires publishing again, so moderation cannot be bypassed.
    return tx.chapter.update({
      where: { id },
      data: {
        title: input.title,
        ...clean,
        revision: { increment: 1 },
        status: 'DRAFT',
        publishAt: null,
        contentHash: tokenHash(normalize(clean.text)),
      },
    });
  });
  if (previous.status === 'PUBLISHED') await refreshStory(previous.storyId);
  invalidateStories();
  return result;
}
export async function restoreVersion(user: Actor, id: string, versionId: string) {
  const chapter = await ownChapter(user, id);
  const version = await db.chapterVersion.findFirst({ where: { id: versionId, chapterId: id } });
  if (!version) throw new AppError('NOT_FOUND', 404);
  return saveChapter(user, id, {
    title: version.title,
    html: version.html,
    revision: chapter.revision,
  });
}
export async function refreshStory(storyId: string) {
  const totals = await db.chapter.aggregate({
    where: { storyId, status: 'PUBLISHED', hiddenAt: null, deletedAt: null },
    _sum: { wordCount: true },
    _count: true,
  });
  await db.story.update({
    where: { id: storyId },
    data: { wordCount: totals._sum.wordCount ?? 0, published: totals._count > 0 },
  });
}
export async function publishChecks(id: string) {
  const chapter = await db.chapter.findUniqueOrThrow({
    where: { id },
    include: { story: { include: { author: true, tags: { include: { tag: true } } } } },
  });
  const words = await db.bannedWord.findMany();
  const normalized = normalize(
    `${chapter.title} ${chapter.text} ${chapter.story.title} ${chapter.story.description} ${chapter.story.tags.map((t) => t.tag.name).join(' ')}`,
  );
  const duplicate =
    chapter.contentHash && chapter.text.length > 200
      ? await db.chapter.findFirst({
          where: {
            contentHash: chapter.contentHash,
            id: { not: id },
            story: { authorId: { not: chapter.story.authorId } },
            deletedAt: null,
          },
        })
      : null;
  return {
    chapter,
    flagged:
      words.some((w) => normalized.includes(normalize(w.word))) ||
      (chapter.text.match(/https?:\/\//g)?.length ?? 0) > 5 ||
      !!duplicate,
  };
}
export async function publishChapter(id: string, actor?: Actor, reviewed = false) {
  if (actor) await ownChapter(actor, id);
  const { chapter, flagged } = await publishChecks(id);
  const author = chapter.story.author;
  if (
    chapter.deletedAt ||
    chapter.hiddenAt ||
    chapter.story.deletedAt ||
    chapter.story.hiddenAt ||
    author.deletedAt ||
    author.bannedAt ||
    (author.suspendedUntil && author.suspendedUntil > new Date())
  )
    throw new AppError('FORBIDDEN', 403);
  if (!chapter.wordCount) throw new AppError('EMPTY_CHAPTER');
  if (chapter.status === 'PUBLISHED') return chapter;
  const status = flagged && !reviewed ? 'REVIEW' : 'PUBLISHED';
  const result = await db.$transaction(async (tx) => {
    const updated = await tx.chapter.updateMany({
      where: { id, revision: chapter.revision, status: chapter.status },
      data: { status, publishedAt: status === 'PUBLISHED' ? new Date() : null, publishAt: null },
    });
    if (!updated.count) throw new AppError('VERSION_CONFLICT', 409);
    if (status === 'REVIEW')
      await tx.report.create({
        data: {
          targetType: 'CHAPTER',
          targetId: id,
          reason: 'AUTOMATED',
          note: 'Banned word, link density, or duplicate content.',
        },
      });
    return tx.chapter.findUniqueOrThrow({ where: { id } });
  });
  await refreshStory(chapter.storyId);
  if (status === 'PUBLISHED')
    await queue().add(
      'chapter-notifications',
      { chapterId: id, revision: result.revision },
      { jobId: `chapter-${id}-${result.revision}` },
    );
  return result;
}
export async function setPublication(
  user: Actor,
  id: string,
  input: z.infer<typeof publicationInput>,
) {
  await ownChapter(user, id);
  if (input.status === 'PUBLISHED') {
    const result = await publishChapter(id, user);
    invalidateStories();
    return result;
  }
  if (input.status === 'SCHEDULED' && (!input.publishAt || input.publishAt <= new Date()))
    throw new AppError('FUTURE_DATE_REQUIRED');
  const chapter = await db.chapter.update({
    where: { id },
    data: {
      status: input.status,
      publishAt: input.status === 'SCHEDULED' ? input.publishAt : null,
    },
  });
  await refreshStory(chapter.storyId);
  if (chapter.publishAt)
    await queue().add(
      'publish',
      { chapterId: id, at: chapter.publishAt.toISOString() },
      {
        delay: chapter.publishAt.getTime() - Date.now(),
        jobId: `publish-${id}-${chapter.publishAt.getTime()}`,
      },
    );
  invalidateStories();
  return chapter;
}
export async function reorderChapters(user: Actor, storyId: string, ids: string[]) {
  await ownStory(user, storyId);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Story" WHERE id = ${storyId} FOR UPDATE`;
    const all = await tx.chapter.findMany({ where: { storyId }, orderBy: { number: 'asc' } });
    const active = all.filter((c) => !c.deletedAt);
    if (
      new Set(ids).size !== ids.length ||
      ids.length !== active.length ||
      ids.some((id) => !active.some((c) => c.id === id))
    )
      throw new AppError('INVALID_ORDER');
    const order = [...ids, ...all.filter((c) => c.deletedAt).map((c) => c.id)];
    for (let i = 0; i < order.length; i++)
      await tx.chapter.update({ where: { id: order[i] }, data: { number: -(i + 1) } });
    for (let i = 0; i < order.length; i++)
      await tx.chapter.update({ where: { id: order[i] }, data: { number: i + 1 } });
  });
  invalidateStories();
  return { success: true };
}
export async function lifecycle(
  user: Actor,
  type: 'story' | 'chapter',
  id: string,
  action: 'delete' | 'restore' | 'unpublish',
) {
  const record =
    type === 'story' ? await ownStory(user, id, true) : await ownChapter(user, id, true);
  if (
    action === 'restore' &&
    (!record.deletedAt || record.deletedAt < new Date(Date.now() - 30 * 86400_000))
  )
    throw new AppError('RECOVERY_EXPIRED');
  const deletedAt = action === 'delete' ? new Date() : null;
  if (type === 'story') {
    await db.story.update({
      where: { id },
      data: action === 'unpublish' ? { published: false } : { deletedAt },
    });
    if (action === 'unpublish')
      await db.chapter.updateMany({
        where: { storyId: id, status: { in: ['PUBLISHED', 'SCHEDULED'] } },
        data: { status: 'DRAFT', publishAt: null },
      });
  } else {
    const chapter = await db.chapter.update({
      where: { id },
      data:
        action === 'unpublish'
          ? { status: 'DRAFT', publishAt: null }
          : { deletedAt, ...(action === 'delete' ? { status: 'DRAFT', publishAt: null } : {}) },
    });
    await refreshStory(chapter.storyId);
  }
  invalidateStories();
  return { success: true };
}
