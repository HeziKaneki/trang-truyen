import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from '../db';
import { authorize, type Actor } from '../security';
import { AppError } from '../errors';
import { readableChapter, readableStory } from './stories';
import { notify } from './notifications';
export const toggleInput = z.object({ enabled: z.boolean() });
export const commentInput = z.object({
  body: z.string().trim().min(1).max(3000),
  parentId: z.string().cuid().optional(),
});
export const progressInput = z.object({
  chapterId: z.string().cuid(),
  position: z.number().min(0).max(1),
});
export const listInput = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), name: z.string().trim().min(1).max(80) }),
  z.object({
    action: z.literal('rename'),
    id: z.string().cuid(),
    name: z.string().trim().min(1).max(80),
  }),
  z.object({ action: z.literal('delete'), id: z.string().cuid() }),
  z.object({
    action: z.literal('item'),
    id: z.string().cuid(),
    storyId: z.string().cuid(),
    enabled: z.boolean(),
  }),
]);
export const dayStart = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};
async function daily(
  tx: Prisma.TransactionClient,
  storyId: string,
  field: 'votes' | 'comments' | 'followers',
  delta: number,
) {
  const day = dayStart();
  await tx.storyDailyStat.upsert({
    where: { storyId_day: { storyId, day } },
    create: { storyId, day, [field]: delta },
    update: { [field]: { increment: delta } },
  });
}
export async function vote(user: Actor, type: 'story' | 'chapter', id: string, enabled: boolean) {
  authorize(user);
  const target = type === 'story' ? await readableStory(id, user) : await readableChapter(id, user);
  const storyId = 'storyId' in target ? target.storyId : target.id;
  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Story" WHERE id = ${storyId} FOR UPDATE`;
    let changed = 0;
    if (type === 'story') {
      const key = { userId: user.id, storyId: id };
      changed = enabled
        ? (await tx.storyVote.createMany({ data: [key], skipDuplicates: true })).count
        : -(await tx.storyVote.deleteMany({ where: key })).count;
    } else {
      const key = { userId: user.id, chapterId: id };
      changed = enabled
        ? (await tx.chapterVote.createMany({ data: [key], skipDuplicates: true })).count
        : -(await tx.chapterVote.deleteMany({ where: key })).count;
    }
    if (changed) await daily(tx, storyId, 'votes', changed);
    return type === 'story'
      ? tx.storyVote.count({ where: { storyId: id } })
      : tx.chapterVote.count({ where: { chapterId: id } });
  });
  const story = await db.story.findUniqueOrThrow({ where: { id: storyId } });
  if (enabled && result > 0 && result % 10 === 0)
    await notify(
      story.authorId,
      'MILESTONE',
      `${story.title} · ${result} ♥`,
      `/truyen/${story.slug}`,
      `milestone-${type}-${id}-${result}`,
    );
  return { enabled, count: result };
}
export async function follow(user: Actor, id: string, enabled: boolean) {
  authorize(user);
  if (id === user.id) throw new AppError('INVALID_INPUT');
  const author = await db.user.findFirst({ where: { id, deletedAt: null, bannedAt: null } });
  if (!author) throw new AppError('NOT_FOUND', 404);
  const key = { followerId: user.id, followingId: id };
  const changed = enabled
    ? (await db.follow.createMany({ data: [key], skipDuplicates: true })).count
    : (await db.follow.deleteMany({ where: key })).count;
  if (enabled && changed)
    await notify(
      id,
      'FOLLOW',
      user.name || user.username,
      `/tac-gia/${user.username}`,
      `follow-${user.id}-${Date.now()}`,
    );
  return { enabled };
}
export async function library(user: Actor, id: string, enabled: boolean) {
  authorize(user);
  await readableStory(id, user);
  await db.$transaction(async (tx) => {
    const key = { userId: user.id, storyId: id };
    const change = enabled
      ? (await tx.libraryItem.createMany({ data: [key], skipDuplicates: true })).count
      : -(await tx.libraryItem.deleteMany({ where: key })).count;
    if (change) await daily(tx, id, 'followers', change);
  });
  return { enabled };
}
export async function readingProgress(user: Actor, input: z.infer<typeof progressInput>) {
  authorize(user);
  const chapter = await readableChapter(input.chapterId, user);
  await db.$transaction([
    db.readingProgress.upsert({
      where: { userId_storyId: { userId: user.id, storyId: chapter.storyId } },
      create: { userId: user.id, storyId: chapter.storyId, ...input },
      update: input,
    }),
    db.libraryItem.updateMany({
      where: { userId: user.id, storyId: chapter.storyId },
      data: { lastReadAt: new Date() },
    }),
  ]);
  return { success: true };
}
export async function readingList(user: Actor, input: z.infer<typeof listInput>) {
  authorize(user);
  if (input.action === 'create')
    return db.readingList.create({ data: { userId: user.id, name: input.name } });
  const list = await db.readingList.findUnique({ where: { id: input.id } });
  if (!list) throw new AppError('NOT_FOUND', 404);
  authorize(user, { ownerId: list.userId });
  if (input.action === 'rename')
    return db.readingList.update({ where: { id: input.id }, data: { name: input.name } });
  if (input.action === 'delete') return db.readingList.delete({ where: { id: input.id } });
  await readableStory(input.storyId, user);
  const key = { listId: input.id, storyId: input.storyId };
  if (input.enabled)
    await db.readingListItem.upsert({ where: { listId_storyId: key }, create: key, update: {} });
  else await db.readingListItem.deleteMany({ where: key });
  return { success: true };
}
export async function comments(
  chapterId: string,
  user: Actor | null,
  guest: boolean,
  cursor?: string,
) {
  await readableChapter(chapterId, user, guest);
  const rows = await db.comment.findMany({
    where: { chapterId, parentId: null, hiddenAt: null, deletedAt: null },
    include: {
      user: { select: { id: true, name: true, username: true, image: true } },
      replies: {
        where: { hiddenAt: null, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { id: true, name: true, username: true, image: true } } },
        take: 100,
      },
    },
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    take: 21,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  return { items: rows.slice(0, 20), nextCursor: rows.length > 20 ? rows[19].id : null };
}
export async function createComment(
  user: Actor,
  chapterId: string,
  input: z.infer<typeof commentInput>,
) {
  authorize(user);
  const chapter = await readableChapter(chapterId, user);
  if ((input.body.match(/https?:\/\//g)?.length ?? 0) > 2) throw new AppError('SPAM');
  if (
    await db.comment.findFirst({
      where: {
        userId: user.id,
        body: input.body,
        createdAt: { gte: new Date(Date.now() - 60000) },
      },
    })
  )
    throw new AppError('SPAM');
  const parent = input.parentId
    ? await db.comment.findFirst({
        where: { id: input.parentId, chapterId, parentId: null, hiddenAt: null, deletedAt: null },
      })
    : null;
  if (input.parentId && !parent) throw new AppError('INVALID_PARENT');
  if (parent && (await db.comment.count({ where: { parentId: parent.id } })) >= 100)
    throw new AppError('THREAD_FULL');
  const result = await db.$transaction(async (tx) => {
    const result = await tx.comment.create({
      data: { chapterId, userId: user.id, ...input },
      include: { user: { select: { id: true, name: true, username: true, image: true } } },
    });
    await daily(tx, chapter.storyId, 'comments', 1);
    return result;
  });
  if (parent && parent.userId !== user.id)
    await notify(
      parent.userId,
      'REPLY',
      `${user.name || user.username} · ${chapter.title}`,
      `/truyen/${chapter.story.slug}/chuong-${chapter.number}#comments`,
      `reply-${result.id}`,
    );
  return result;
}
export async function editComment(
  user: Actor,
  id: string,
  input: { action: 'edit' | 'delete' | 'pin'; body?: string; pinned?: boolean },
) {
  const comment = await db.comment.findUnique({
    where: { id },
    include: { chapter: { include: { story: true } } },
  });
  if (!comment) throw new AppError('NOT_FOUND', 404);
  authorize(user, {
    ownerId:
      input.action === 'pin' || (input.action === 'delete' && user.id !== comment.userId)
        ? comment.chapter.story.authorId
        : comment.userId,
  });
  if (input.action === 'pin' && comment.parentId) throw new AppError('INVALID_INPUT');
  return db.comment.update({
    where: { id },
    data:
      input.action === 'edit'
        ? { body: input.body }
        : input.action === 'pin'
          ? { pinned: input.pinned ?? true }
          : { deletedAt: new Date() },
  });
}
