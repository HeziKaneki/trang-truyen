import { hash, verify, argon2id } from 'argon2';
import { z } from 'zod';
import { db } from '../db';
import { authorize, randomToken, tokenHash, type Actor } from '../security';
import { AppError } from '../errors';
import { env } from '@/lib/env';
import { queue } from '../jobs/queue';
const email = z
  .string()
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
export const password = z.string().min(12).max(128);
export const registerInput = z.object({
  email,
  password,
  name: z.string().trim().min(2).max(80),
  birthDate: z.coerce.date().refine((v) => v <= new Date() && v.getFullYear() >= 1900),
  username: z.string().regex(/^[a-z0-9_]{3,30}$/),
  terms: z.literal(true),
});
export const accountInput = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('profile'),
    name: z.string().trim().min(2).max(80),
    bio: z.string().max(1000),
    image: z
      .string()
      .regex(/^\/uploads\/[a-f0-9-]+\.webp$/)
      .nullable()
      .optional(),
    birthDate: z.coerce.date().max(new Date()).optional(),
  }),
  z.object({
    action: z.literal('preferences'),
    language: z.enum(['vi', 'en']),
    theme: z.enum(['light', 'dark', 'system']),
    allowMature: z.boolean(),
    emailDigest: z.boolean(),
  }),
  z.object({ action: z.literal('password'), currentPassword: z.string().max(128), password }),
  z.object({ action: z.literal('email'), email, currentPassword: z.string().max(128) }),
  z.object({
    action: z.literal('delete'),
    confirmation: z.literal('DELETE'),
    currentPassword: z.string().max(128).optional(),
  }),
  z.object({
    action: z.literal('reader'),
    settings: z.object({
      fontSize: z.number().min(14).max(32),
      lineHeight: z.number().min(1.4).max(2.4),
      width: z.number().min(500).max(1000),
      font: z.enum(['serif', 'sans']),
      theme: z.enum(['light', 'dark', 'sepia']),
    }),
  }),
  z.object({
    action: z.literal('notification'),
    type: z.enum(['CHAPTER', 'REPLY', 'FOLLOW', 'MILESTONE', 'MODERATION']),
    enabled: z.boolean(),
  }),
]);
export const tokenInput = z.object({ token: z.string().length(64), password: password.optional() });
export const emailInput = z.object({ email });
async function issueToken(userId: string, to: string, type: string, newEmail?: string) {
  const token = randomToken();
  await db.$transaction([
    db.emailToken.deleteMany({ where: { userId, type } }),
    db.emailToken.create({
      data: {
        userId,
        tokenHash: tokenHash(token),
        type,
        newEmail,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    }),
  ]);
  await queue().add('mail', {
    to,
    subject: type === 'RESET' ? 'Đặt lại mật khẩu · Trang Truyện' : 'Xác minh email · Trang Truyện',
    text: `${env.APP_URL}/${type === 'RESET' ? 'dat-lai-mat-khau' : 'xac-minh'}?token=${token}\nLiên kết có hiệu lực trong 60 phút.`,
  });
}
export async function register(input: z.infer<typeof registerInput>) {
  const existing = await db.user.findUnique({ where: { email: input.email } });
  if (existing) return { sent: true };
  const user = await db.user.create({
    data: {
      email: input.email,
      name: input.name,
      username: input.username,
      birthDate: input.birthDate,
      passwordHash: await hash(input.password, { type: argon2id }),
    },
  });
  await issueToken(user.id, input.email, 'VERIFY');
  return { sent: true };
}
export async function requestToken(address: string, type: 'RESET' | 'VERIFY') {
  const user = await db.user.findUnique({ where: { email: address } });
  if (user && !user.deletedAt && (type !== 'VERIFY' || !user.emailVerified))
    await issueToken(user.id, address, type);
  return { sent: true };
}
export async function consumeToken(input: z.infer<typeof tokenInput>, reset: boolean) {
  const record = await db.emailToken.findUnique({ where: { tokenHash: tokenHash(input.token) } });
  if (
    !record ||
    record.expiresAt < new Date() ||
    (reset ? record.type !== 'RESET' : !['VERIFY', 'EMAIL'].includes(record.type))
  )
    throw new AppError('INVALID_TOKEN');
  if (reset && !input.password) throw new AppError('INVALID_INPUT');
  const data = reset
    ? {
        passwordHash: await hash(input.password!, { type: argon2id }),
        sessionVersion: { increment: 1 },
      }
    : {
        emailVerified: new Date(),
        ...(record.newEmail ? { email: record.newEmail, sessionVersion: { increment: 1 } } : {}),
      };
  await db.$transaction(async (tx) => {
    const consumed = await tx.emailToken.deleteMany({ where: { id: record.id } });
    if (!consumed.count) throw new AppError('INVALID_TOKEN');
    await tx.user.update({ where: { id: record.userId }, data });
  });
  return { success: true };
}
export async function updateAccount(user: Actor, input: z.infer<typeof accountInput>) {
  authorize(user, { ownerId: user.id });
  switch (input.action) {
    case 'profile': {
      if (
        input.image &&
        !(await db.uploadedFile.findFirst({ where: { userId: user.id, url: input.image } }))
      )
        throw new AppError('INVALID_UPLOAD');
      if (input.birthDate && user.birthDate) throw new AppError('BIRTHDATE_LOCKED');
      await db.user.update({
        where: { id: user.id },
        data: {
          name: input.name,
          bio: input.bio,
          image: input.image,
          ...(input.birthDate ? { birthDate: input.birthDate } : {}),
        },
      });
      break;
    }
    case 'preferences': {
      const { action: _action, ...data } = input;
      await db.user.update({ where: { id: user.id }, data });
      break;
    }
    case 'password':
    case 'email': {
      if (!user.passwordHash || !(await verify(user.passwordHash, input.currentPassword)))
        throw new AppError('WRONG_PASSWORD', 403);
      if (input.action === 'password')
        await db.user.update({
          where: { id: user.id },
          data: {
            passwordHash: await hash(input.password, { type: argon2id }),
            sessionVersion: { increment: 1 },
          },
        });
      else await issueToken(user.id, input.email, 'EMAIL', input.email);
      break;
    }
    case 'delete': {
      if (
        user.passwordHash &&
        (!input.currentPassword || !(await verify(user.passwordHash, input.currentPassword)))
      )
        throw new AppError('WRONG_PASSWORD', 403);
      await db.$transaction([
        db.user.update({
          where: { id: user.id },
          data: {
            deletedAt: new Date(),
            email: null,
            name: null,
            bio: '',
            image: null,
            passwordHash: null,
            birthDate: null,
            sessionVersion: { increment: 1 },
          },
        }),
        db.story.updateMany({ where: { authorId: user.id }, data: { deletedAt: new Date() } }),
        db.account.deleteMany({ where: { userId: user.id } }),
        db.emailToken.deleteMany({ where: { userId: user.id } }),
      ]);
      break;
    }
    case 'reader':
      await db.user.update({ where: { id: user.id }, data: { readerSettings: input.settings } });
      break;
    case 'notification':
      await db.notificationPreference.upsert({
        where: { userId_type: { userId: user.id, type: input.type } },
        create: { userId: user.id, type: input.type, enabled: input.enabled },
        update: { enabled: input.enabled },
      });
      break;
  }
  return { success: true };
}
