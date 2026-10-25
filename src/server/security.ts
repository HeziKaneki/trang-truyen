import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { User } from '@prisma/client';
import { headers } from 'next/headers';
import { db } from './db';
import { redis } from './redis';
import { AppError } from './errors';
import { env } from '@/lib/env';
import { isAdult } from '@/lib/utils';
export type Actor = User;
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
export const randomToken = () => randomBytes(32).toString('hex');
export function assertActive(
  user: Pick<User, 'deletedAt' | 'bannedAt' | 'suspendedUntil'> | null,
): asserts user {
  if (
    !user ||
    user.deletedAt ||
    user.bannedAt ||
    (user.suspendedUntil && user.suspendedUntil > new Date())
  )
    throw new AppError('UNAUTHORIZED', 401);
}
export async function currentUser() {
  const { auth } = await import('./auth');
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  try {
    assertActive(user);
    return user;
  } catch {
    return null;
  }
}
export async function requireUser(verified = true) {
  const user = await currentUser();
  assertActive(user);
  if (verified && !user.emailVerified) throw new AppError('VERIFY_EMAIL', 403);
  return user;
}
export function authorize(
  user: Actor,
  options: { ownerId?: string; role?: 'MODERATOR' | 'ADMIN' } = {},
) {
  assertActive(user);
  if (options.role && user.role !== 'ADMIN' && user.role !== options.role)
    throw new AppError('FORBIDDEN', 403);
  if (options.ownerId && user.id !== options.ownerId) throw new AppError('FORBIDDEN', 403);
}
export function canMature(
  user: Pick<User, 'birthDate' | 'allowMature'> | null,
  guestConfirmed = false,
) {
  return user ? isAdult(user.birthDate) && user.allowMature : guestConfirmed;
}
export async function requestIdentity() {
  const h = await headers();
  // Caddy overwrites this header. The web port must not be exposed publicly.
  const ip = h.get('x-real-ip') || 'local';
  return tokenHash(`${env.AUTH_SECRET}:${ip}`).slice(0, 32);
}
export const RATE_SCRIPT = `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n`;
export async function rateLimit(key: string, limit: number, seconds = 60) {
  const n = Number(await redis().eval(RATE_SCRIPT, 1, `rate:${key}`, seconds));
  if (n > limit) throw new AppError('RATE_LIMITED', 429);
}
export function checkCsrf(request: Request) {
  if (request.headers.get('origin') !== new URL(env.APP_URL).origin)
    throw new AppError('CSRF', 403);
  const header = request.headers.get('x-csrf-token') ?? '';
  const cookie =
    request.headers
      .get('cookie')
      ?.split('; ')
      .find((c) => c.startsWith('novel-csrf='))
      ?.slice(11) ?? '';
  if (
    !/^[a-f0-9]{64}$/.test(header) ||
    !/^[a-f0-9]{64}$/.test(cookie) ||
    !timingSafeEqual(Buffer.from(header), Buffer.from(cookie))
  )
    throw new AppError('CSRF', 403);
}
