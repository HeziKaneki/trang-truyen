import { Queue } from 'bullmq';
import { env } from '@/lib/env';
let instance: Queue | undefined;
export function connection() {
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}
export function queue() {
  return (instance ??= new Queue('novel', {
    connection: connection(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 200,
      removeOnFail: 500,
    },
  }));
}
