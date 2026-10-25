import type { NotificationType } from '@prisma/client';
import { db } from '../db';
import { redis } from '../redis';
export async function notify(
  userId: string,
  type: NotificationType,
  title: string,
  url: string,
  eventKey: string,
) {
  const pref = await db.notificationPreference.findUnique({
    where: { userId_type: { userId, type } },
  });
  if (pref?.enabled === false) return;
  await db.notification.upsert({
    where: { userId_eventKey: { userId, eventKey } },
    create: { userId, type, title, url, eventKey },
    update: {},
  });
  await redis().publish(`notifications:${userId}`, JSON.stringify({ type: 'refresh' }));
}
export async function chapterNotifications(chapterId: string, revision: number) {
  const chapter = await db.chapter.findUnique({
    where: { id: chapterId },
    include: { story: { include: { library: true, author: { include: { followers: true } } } } },
  });
  if (
    !chapter ||
    chapter.status !== 'PUBLISHED' ||
    chapter.deletedAt ||
    chapter.hiddenAt ||
    chapter.story.deletedAt ||
    chapter.story.hiddenAt
  )
    return;
  const ids = new Set([
    ...chapter.story.library.map((v) => v.userId),
    ...chapter.story.author.followers.map((v) => v.followerId),
  ]);
  ids.delete(chapter.story.authorId);
  for (const userId of ids)
    await notify(
      userId,
      'CHAPTER',
      `${chapter.story.title} · ${chapter.title}`,
      `/truyen/${chapter.story.slug}/chuong-${chapter.number}`,
      `chapter-${chapterId}-${revision}`,
    );
}
