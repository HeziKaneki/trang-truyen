import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { verify } from 'argon2';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { db } from './db';
import { redis } from './redis';
import { env } from '@/lib/env';
const credentialsSchema = z.object({
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(128),
});
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: '/dang-nhap' },
  trustHost: true,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (raw, request) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const key = createHash('sha256').update(parsed.data.email).digest('hex');
        const ipKey = createHash('sha256')
          .update(request.headers.get('x-real-ip') || 'local')
          .digest('hex');
        const attempts = Number(
          await redis().eval(
            "local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],900) end;return n",
            1,
            `login-ip:${ipKey}`,
          ),
        );
        if (attempts > 50 || Number(await redis().get(`login:${key}`)) >= 8) return null;
        const user = await db.user.findUnique({ where: { email: parsed.data.email } });
        if (
          !user?.passwordHash ||
          !(await verify(user.passwordHash, parsed.data.password)) ||
          user.deletedAt ||
          user.bannedAt ||
          (user.suspendedUntil && user.suspendedUntil > new Date())
        ) {
          await redis().multi().incr(`login:${key}`).expire(`login:${key}`, 900).exec();
          return null;
        }
        await redis().del(`login:${key}`);
        return user;
      },
    }),
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.id) return true;
      const record = await db.user.findUnique({ where: { id: user.id } });
      return (
        !record ||
        (!record.deletedAt &&
          !record.bannedAt &&
          (!record.suspendedUntil || record.suspendedUntil <= new Date()))
      );
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        const record = await db.user.findUnique({ where: { id: user.id } });
        token.version = record?.sessionVersion ?? 0;
      }
      if (token.sub) {
        const record = await db.user.findUnique({ where: { id: token.sub } });
        if (
          !record ||
          record.sessionVersion !== token.version ||
          record.deletedAt ||
          record.bannedAt ||
          (record.suspendedUntil && record.suspendedUntil > new Date())
        )
          return null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (user.id)
        await db.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
    },
  },
});
export function authOrigin() {
  return env.APP_URL;
}
