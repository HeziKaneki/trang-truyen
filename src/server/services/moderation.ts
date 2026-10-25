import { z } from 'zod';
import { db } from '../db';
import { authorize, type Actor } from '../security';
import { AppError } from '../errors';
import { notify } from './notifications';
import { invalidateStories, publishChapter, refreshStory } from './stories';
import { normalize, slugify } from '@/lib/utils';
export const reportInput = z.object({
  targetType: z.enum(['STORY', 'CHAPTER', 'COMMENT', 'USER']),
  targetId: z.string().cuid(),
  reason: z.enum(['SPAM', 'ABUSE', 'SEXUAL', 'VIOLENCE', 'COPYRIGHT', 'OTHER']),
  note: z.string().trim().min(10).max(5000),
  contactEmail: z.string().email().optional(),
});
export const moderationInput = z.object({
  reportId: z.string().cuid().optional(),
  targetType: z.enum(['STORY', 'CHAPTER', 'COMMENT', 'USER']),
  targetId: z.string().cuid(),
  action: z.enum([
    'HIDE',
    'REMOVE',
    'RESTORE',
    'WARN',
    'SUSPEND',
    'BAN',
    'UNBAN',
    'APPROVE',
    'DISMISS',
  ]),
  note: z.string().trim().min(5).max(2000),
  days: z.number().int().min(1).max(365).optional(),
});
export const adminInput = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('role'),
    userId: z.string().cuid(),
    role: z.enum(['USER', 'MODERATOR', 'ADMIN']),
  }),
  z.object({
    action: z.literal('category'),
    id: z.string().cuid().optional(),
    name: z.string().trim().min(2).max(50),
  }),
  z.object({ action: z.literal('delete-category'), id: z.string().cuid() }),
  z.object({
    action: z.literal('tag'),
    id: z.string().cuid().optional(),
    name: z.string().trim().min(2).max(30),
  }),
  z.object({ action: z.literal('delete-tag'), id: z.string().cuid() }),
  z.object({
    action: z.literal('merge-tags'),
    sourceId: z.string().cuid(),
    targetId: z.string().cuid(),
  }),
  z.object({
    action: z.literal('banned-word'),
    word: z.string().trim().min(2).max(80),
    enabled: z.boolean(),
  }),
  z.object({
    action: z.literal('featured'),
    storyId: z.string().cuid(),
    enabled: z.boolean(),
    position: z.number().int().min(0).max(100).default(0),
  }),
  z.object({
    action: z.literal('setting'),
    key: z.enum(['siteName', 'announcement', 'registrationOpen']),
    value: z.string().max(500),
  }),
]);
async function target(type: z.infer<typeof reportInput>['targetType'], id: string) {
  if (type === 'STORY') {
    const row = await db.story.findUnique({ where: { id } });
    return row ? { ownerId: row.authorId, title: row.title } : null;
  }
  if (type === 'CHAPTER') {
    const row = await db.chapter.findUnique({ where: { id }, include: { story: true } });
    return row ? { ownerId: row.story.authorId, title: row.title } : null;
  }
  if (type === 'COMMENT') {
    const row = await db.comment.findUnique({ where: { id } });
    return row ? { ownerId: row.userId, title: row.body.slice(0, 50) } : null;
  }
  const row = await db.user.findUnique({ where: { id } });
  return row ? { ownerId: row.id, title: row.username } : null;
}
export async function createReport(user: Actor | null, input: z.infer<typeof reportInput>) {
  if (user) authorize(user);
  else if (input.reason !== 'COPYRIGHT' || !input.contactEmail)
    throw new AppError('UNAUTHORIZED', 401);
  if (!(await target(input.targetType, input.targetId))) throw new AppError('NOT_FOUND', 404);
  return db.report.create({ data: { ...input, reporterId: user?.id } });
}
export async function moderate(user: Actor, input: z.infer<typeof moderationInput>) {
  authorize(user, { role: 'MODERATOR' });
  const subject = await target(input.targetType, input.targetId);
  if (!subject) throw new AppError('NOT_FOUND', 404);
  const owner = await db.user.findUniqueOrThrow({ where: { id: subject.ownerId } });
  if (owner.role === 'ADMIN' || (owner.role === 'MODERATOR' && user.role !== 'ADMIN'))
    throw new AppError('FORBIDDEN', 403);
  if (
    input.reportId &&
    !(await db.report.findFirst({
      where: { id: input.reportId, targetId: input.targetId, targetType: input.targetType },
    }))
  )
    throw new AppError('INVALID_INPUT');
  const { action, targetType, targetId } = input;
  if (['WARN', 'SUSPEND', 'BAN', 'UNBAN'].includes(action) && targetType !== 'USER')
    throw new AppError('INVALID_INPUT');
  if (['HIDE', 'REMOVE', 'RESTORE', 'APPROVE'].includes(action) && targetType === 'USER')
    throw new AppError('INVALID_INPUT');
  if (action === 'APPROVE' && targetType !== 'CHAPTER') throw new AppError('INVALID_INPUT');
  const audit = await db.$transaction(async (tx) => {
    if (action === 'SUSPEND' || action === 'BAN' || action === 'UNBAN')
      await tx.user.update({
        where: { id: targetId },
        data:
          action === 'BAN'
            ? { bannedAt: new Date(), sessionVersion: { increment: 1 } }
            : action === 'UNBAN'
              ? { bannedAt: null, suspendedUntil: null }
              : {
                  suspendedUntil: new Date(Date.now() + (input.days ?? 7) * 86400_000),
                  sessionVersion: { increment: 1 },
                },
      });
    if (['HIDE', 'REMOVE', 'RESTORE'].includes(action)) {
      const data =
        action === 'RESTORE'
          ? { hiddenAt: null, deletedAt: null }
          : action === 'REMOVE'
            ? { hiddenAt: new Date(), deletedAt: new Date() }
            : { hiddenAt: new Date() };
      if (targetType === 'STORY') await tx.story.update({ where: { id: targetId }, data });
      if (targetType === 'CHAPTER') await tx.chapter.update({ where: { id: targetId }, data });
      if (targetType === 'COMMENT') await tx.comment.update({ where: { id: targetId }, data });
    }
    if (input.reportId)
      await tx.report.update({
        where: { id: input.reportId },
        data: { status: action === 'DISMISS' ? 'DISMISSED' : 'RESOLVED' },
      });
    return tx.moderationAction.create({
      data: {
        moderatorId: user.id,
        reportId: input.reportId,
        action,
        targetType,
        targetId,
        note: input.note,
      },
    });
  });
  if (action === 'APPROVE') await publishChapter(targetId, undefined, true);
  if (targetType === 'CHAPTER') {
    const chapter = await db.chapter.findUniqueOrThrow({ where: { id: targetId } });
    await refreshStory(chapter.storyId);
  }
  await notify(
    subject.ownerId,
    'MODERATION',
    `${subject.title} · ${input.note}`,
    '/thong-bao',
    `moderation-${audit.id}`,
  );
  if (input.reportId) {
    const report = await db.report.findUnique({ where: { id: input.reportId } });
    if (report?.reporterId)
      await notify(report.reporterId, 'MODERATION', input.note, '/thong-bao', `report-${audit.id}`);
  }
  invalidateStories();
  return audit;
}
export async function administer(user: Actor, input: z.infer<typeof adminInput>) {
  authorize(user, { role: 'ADMIN' });
  switch (input.action) {
    case 'role':
      if (input.userId === user.id) throw new AppError('FORBIDDEN', 403);
      await db.user.update({
        where: { id: input.userId },
        data: { role: input.role, sessionVersion: { increment: 1 } },
      });
      break;
    case 'category': {
      const data = { name: input.name, slug: slugify(input.name) };
      if (input.id) await db.category.update({ where: { id: input.id }, data });
      else await db.category.create({ data });
      break;
    }
    case 'delete-category':
      if (await db.story.count({ where: { categoryId: input.id } }))
        throw new AppError('CATEGORY_IN_USE');
      await db.category.delete({ where: { id: input.id } });
      break;
    case 'tag': {
      const data = { name: input.name, slug: slugify(input.name) };
      if (input.id) await db.tag.update({ where: { id: input.id }, data });
      else await db.tag.create({ data });
      break;
    }
    case 'delete-tag':
      await db.tag.delete({ where: { id: input.id } });
      break;
    case 'merge-tags': {
      if (input.sourceId === input.targetId) throw new AppError('INVALID_INPUT');
      await db.$transaction(async (tx) => {
        await tx.tag.findUniqueOrThrow({ where: { id: input.targetId } });
        const links = await tx.storyTag.findMany({ where: { tagId: input.sourceId } });
        await tx.storyTag.createMany({
          data: links.map((l) => ({ storyId: l.storyId, tagId: input.targetId })),
          skipDuplicates: true,
        });
        await tx.tag.delete({ where: { id: input.sourceId } });
      });
      break;
    }
    case 'banned-word':
      if (input.enabled)
        await db.bannedWord.upsert({
          where: { word: normalize(input.word) },
          create: { word: normalize(input.word) },
          update: {},
        });
      else await db.bannedWord.deleteMany({ where: { word: normalize(input.word) } });
      break;
    case 'featured':
      if (input.enabled)
        await db.featuredStory.upsert({
          where: { storyId: input.storyId },
          create: { storyId: input.storyId, position: input.position },
          update: { position: input.position },
        });
      else await db.featuredStory.deleteMany({ where: { storyId: input.storyId } });
      break;
    case 'setting':
      await db.siteSetting.upsert({
        where: { key: input.key },
        create: { key: input.key, value: input.value },
        update: { value: input.value },
      });
      break;
  }
  await db.moderationAction.create({
    data: {
      moderatorId: user.id,
      action: `ADMIN_${input.action}`,
      targetType: input.action === 'role' ? 'USER' : 'STORY',
      targetId: input.action === 'role' ? input.userId : 'site',
      note: JSON.stringify(input),
    },
  });
  invalidateStories();
  return { success: true };
}
