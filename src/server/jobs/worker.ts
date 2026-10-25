import 'dotenv/config';
import { Worker } from 'bullmq';
import { db } from '../db';
import { redis } from '../redis';
import { logger } from '../logger';
import { connection, queue } from './queue';
import { env, validateEnv } from '@/lib/env';
import { trendingScore } from '@/lib/utils';
import { flushCounters } from '../services/counters';
import { chapterNotifications } from '../services/notifications';
import { publishChapter, publicWhere } from '../services/stories';
import { sendMail } from '../mail';
validateEnv();
async function rankings() {
  const stories = await db.story.findMany({
    where: publicWhere(true),
    include: {
      _count: { select: { votes: true } },
      chapters: { select: { _count: { select: { comments: true, votes: true } } } },
      dailyStats: { where: { day: { gte: new Date(Date.now() - 31 * 86400_000) } } },
    },
  });
  const periods = { today: 1, week: 7, month: 30, all: Infinity };
  for (const [period, days] of Object.entries(periods)) {
    const key = `ranking:${period}:next`;
    await redis().del(key);
    for (const story of stories) {
      const stats = story.dailyStats.filter(
        (s) => s.day >= new Date(new Date().setUTCHours(0, 0, 0, 0) - (days - 1) * 86400_000),
      );
      const reads = period === 'all' ? story.reads : stats.reduce((sum, s) => sum + s.reads, 0);
      const votes =
        period === 'all'
          ? story._count.votes + story.chapters.reduce((sum, c) => sum + c._count.votes, 0)
          : stats.reduce((sum, s) => sum + s.votes, 0);
      const comments =
        period === 'all'
          ? story.chapters.reduce((sum, c) => sum + c._count.comments, 0)
          : stats.reduce((sum, s) => sum + s.comments, 0);
      const score = trendingScore(
        reads,
        votes,
        comments,
        period === 'all' ? 0 : (Date.now() - story.updatedAt.getTime()) / 3600_000,
      );
      await redis().zadd(key, score, story.id);
      if (period === 'week')
        await db.story.update({
          where: { id: story.id },
          data: { trending: score, updatedAt: story.updatedAt },
        });
    }
    if (stories.length) await redis().rename(key, `ranking:${period}`);
    else await redis().del(`ranking:${period}`);
  }
}
async function digest() {
  const users = await db.user.findMany({
    where: { emailDigest: true, emailVerified: { not: null }, deletedAt: null, bannedAt: null },
    select: { id: true, email: true },
  });
  for (const user of users) {
    if (!user.email) continue;
    const items = await db.notification.findMany({
      where: {
        userId: user.id,
        type: 'CHAPTER',
        emailedAt: null,
        createdAt: { gte: new Date(Date.now() - 7 * 86400_000) },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    if (!items.length) continue;
    await sendMail(
      user.email,
      'Những chương mới đang chờ bạn · Trang Truyện',
      items.map((n) => `${n.title}\n${env.APP_URL}${n.url}`).join('\n\n') +
        `\n\n${env.APP_URL}/cai-dat`,
    );
    await db.notification.updateMany({
      where: { id: { in: items.map((n) => n.id) } },
      data: { emailedAt: new Date() },
    });
  }
}
async function reconcile() {
  for (const chapter of await db.chapter.findMany({
    where: {
      status: 'SCHEDULED',
      publishAt: { lte: new Date() },
      deletedAt: null,
      hiddenAt: null,
      story: { deletedAt: null, hiddenAt: null },
    },
    take: 100,
  })) {
    try {
      await publishChapter(chapter.id);
    } catch (err) {
      logger.warn({ err, chapterId: chapter.id }, 'Scheduled publication blocked');
    }
  }
  // Recover notification enqueue failures after a committed publication; unique event keys dedupe deliveries.
  for (const chapter of await db.chapter.findMany({
    where: { status: 'PUBLISHED', publishedAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
    select: { id: true, revision: true },
  }))
    await chapterNotifications(chapter.id, chapter.revision);
}
async function cleanup() {
  const cutoff = new Date(Date.now() - 30 * 86400_000);
  await db.chapter.deleteMany({ where: { deletedAt: { lt: cutoff } } });
  await db.story.deleteMany({ where: { deletedAt: { lt: cutoff } } });
  await db.emailToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.notification.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 180 * 86400_000) }, readAt: { not: null } },
  });
}
const worker = new Worker(
  'novel',
  async (job) => {
    switch (job.name) {
      case 'mail':
        await sendMail(job.data.to, job.data.subject, job.data.text);
        break;
      case 'publish': {
        const c = await db.chapter.findUnique({ where: { id: job.data.chapterId } });
        if (
          c?.status === 'SCHEDULED' &&
          c.publishAt &&
          c.publishAt <= new Date() &&
          c.publishAt.toISOString() === job.data.at
        )
          await publishChapter(c.id);
        break;
      }
      case 'chapter-notifications':
        await chapterNotifications(job.data.chapterId, job.data.revision);
        break;
      case 'counters':
        await flushCounters();
        await reconcile();
        break;
      case 'rankings':
        await rankings();
        break;
      case 'digest':
        await digest();
        break;
      case 'cleanup':
        await cleanup();
        break;
      default:
        throw new Error(`Unknown job: ${job.name}`);
    }
  },
  { connection: connection(), concurrency: 3 },
);
worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'Job failed'));
async function start() {
  await queue().upsertJobScheduler(
    'counter-minute',
    { every: 60_000 },
    { name: 'counters', data: {} },
  );
  await queue().upsertJobScheduler(
    'ranking-ten-minutes',
    { every: 600_000 },
    { name: 'rankings', data: {} },
  );
  await queue().upsertJobScheduler(
    'email-daily',
    { pattern: '0 1 * * *', tz: 'UTC' },
    { name: 'digest', data: {} },
  );
  await queue().upsertJobScheduler(
    'cleanup-daily',
    { pattern: '0 3 * * *', tz: 'UTC' },
    { name: 'cleanup', data: {} },
  );
  await redis().set('worker:heartbeat', Date.now(), 'EX', 120);
  logger.info('Worker ready');
}
const heartbeat = setInterval(() => {
  void redis()
    .set('worker:heartbeat', Date.now(), 'EX', 120)
    .catch((err) => logger.error({ err }, 'Heartbeat failed'));
}, 30_000);
async function close() {
  clearInterval(heartbeat);
  await worker.close();
  await queue().close();
  await redis().quit();
  await db.$disconnect();
}
process.on('SIGTERM', () => void close());
process.on('SIGINT', () => void close());
start().catch((err) => {
  logger.fatal({ err }, 'Worker startup failed');
  process.exit(1);
});
