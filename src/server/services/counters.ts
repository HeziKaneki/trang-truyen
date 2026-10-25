import { randomUUID } from 'node:crypto';
import { redis } from '../redis';
import { db } from '../db';
import { dayStart } from './social';
export const READ_SCRIPT = `if redis.call('SET',KEYS[1],'1','EX',ARGV[1],'NX') then redis.call('HINCRBY',KEYS[2],ARGV[2],1);return 1 end;return 0`;
export async function countRead(identity: string, chapterId: string, storyId: string) {
  return Number(
    await redis().eval(
      READ_SCRIPT,
      2,
      `read:${identity}:${chapterId}`,
      `reads:pending:${dayStart().toISOString().slice(0, 10)}`,
      1800,
      `${storyId}|${chapterId}`,
    ),
  );
}
export async function flushCounters() {
  const r = redis();
  let cursor = '0';
  const pending: string[] = [];
  do {
    const [next, keys] = await r.scan(cursor, 'MATCH', 'reads:pending:*', 'COUNT', 100);
    cursor = next;
    pending.push(...keys);
  } while (cursor !== '0');
  for (const key of pending) {
    const batch = `reads:batch:${key.split(':').at(-1)}:${randomUUID()}`;
    await r.eval(
      "if redis.call('EXISTS',KEYS[1])==1 then redis.call('RENAME',KEYS[1],KEYS[2]);redis.call('SADD',KEYS[3],KEYS[2]);return 1 end;return 0",
      3,
      key,
      batch,
      'reads:batches',
    );
  }
  for (const batch of await r.smembers('reads:batches')) {
    const values = await r.hgetall(batch);
    const day = new Date(`${batch.split(':')[2]}T00:00:00Z`);
    await db.$transaction(async (tx) => {
      const claimed = await tx.counterBatch.createMany({
        data: [{ id: batch }],
        skipDuplicates: true,
      });
      if (!claimed.count) return;
      for (const [key, raw] of Object.entries(values)) {
        const [storyId, chapterId] = key.split('|');
        const reads = Number(raw);
        if (!Number.isSafeInteger(reads) || reads < 1) continue;
        if (
          !(
            await tx.chapter.updateMany({
              where: { id: chapterId },
              data: { reads: { increment: reads } },
            })
          ).count
        )
          continue;
        await tx.story.update({ where: { id: storyId }, data: { reads: { increment: reads } } });
        await tx.chapterReadStat.upsert({
          where: { chapterId_day: { chapterId, day } },
          create: { chapterId, day, reads },
          update: { reads: { increment: reads } },
        });
        await tx.storyDailyStat.upsert({
          where: { storyId_day: { storyId, day } },
          create: { storyId, day, reads },
          update: { reads: { increment: reads } },
        });
      }
    });
    await r.multi().del(batch).srem('reads:batches', batch).exec();
  }
}
