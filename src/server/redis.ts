import Redis from 'ioredis';
import { env } from '@/lib/env';
const globalRedis = globalThis as unknown as { redis?: Redis };
export function redis() {
  return (globalRedis.redis ??= new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    enableReadyCheck: true,
  }));
}
