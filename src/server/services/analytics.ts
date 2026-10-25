import { db } from '../db';
import { authorize, type Actor } from '../security';
export async function analytics(user: Actor) {
  authorize(user);
  const since = new Date(Date.now() - 29 * 86400_000);
  since.setUTCHours(0, 0, 0, 0);
  const [stats, chapters, follows, stories] = await Promise.all([
    db.storyDailyStat.findMany({
      where: { story: { authorId: user.id }, day: { gte: since } },
      orderBy: { day: 'asc' },
    }),
    db.chapter.findMany({
      where: { story: { authorId: user.id }, deletedAt: null },
      orderBy: { reads: 'desc' },
      take: 10,
      include: {
        story: { select: { title: true } },
        _count: { select: { votes: true, comments: true } },
      },
    }),
    db.follow.findMany({
      where: { followingId: user.id, createdAt: { gte: since } },
      select: { createdAt: true },
    }),
    db.story.findMany({
      where: { authorId: user.id, deletedAt: null },
      select: { reads: true, _count: { select: { votes: true, library: true } } },
    }),
  ]);
  const days = Array.from({ length: 30 }, (_, i) => {
    const day = new Date(since.getTime() + i * 86400_000).toISOString().slice(0, 10);
    const rows = stats.filter((s) => s.day.toISOString().startsWith(day));
    return {
      day,
      reads: rows.reduce((s, r) => s + r.reads, 0),
      votes: rows.reduce((s, r) => s + r.votes, 0),
      comments: rows.reduce((s, r) => s + r.comments, 0),
      followers: follows.filter((f) => f.createdAt.toISOString().startsWith(day)).length,
    };
  });
  return { days, chapters, stories };
}
