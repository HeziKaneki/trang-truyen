import type { MetadataRoute } from 'next';
import { db } from '@/server/db';
import { publicWhere } from '@/server/services/stories';
import { env } from '@/lib/env';
export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [stories, authors] = await Promise.all([
    db.story.findMany({
      where: publicWhere(),
      select: {
        slug: true,
        updatedAt: true,
        chapters: {
          where: { status: 'PUBLISHED', hiddenAt: null, deletedAt: null },
          select: { number: true, updatedAt: true },
        },
      },
      take: 5000,
    }),
    db.user.findMany({
      where: { deletedAt: null, bannedAt: null, stories: { some: publicWhere() } },
      select: { username: true, updatedAt: true },
      take: 5000,
    }),
  ]);
  return [
    { url: env.APP_URL, changeFrequency: 'daily' as const, priority: 1 },
    ...stories.flatMap((s) => [
      { url: `${env.APP_URL}/truyen/${s.slug}`, lastModified: s.updatedAt },
      ...s.chapters.map((c) => ({
        url: `${env.APP_URL}/truyen/${s.slug}/chuong-${c.number}`,
        lastModified: c.updatedAt,
      })),
    ]),
    ...authors.map((a) => ({
      url: `${env.APP_URL}/tac-gia/${a.username}`,
      lastModified: a.updatedAt,
    })),
  ].slice(0, 49000);
}
