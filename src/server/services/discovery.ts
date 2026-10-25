import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { unstable_cache } from 'next/cache';
import { db } from '../db';
import { redis } from '../redis';
import { canMature, type Actor } from '../security';
import { publicWhere } from './stories';
export const browseInput = z.object({
  q: z.string().trim().max(100).default(''),
  category: z.string().max(80).optional(),
  tag: z.string().max(80).optional(),
  status: z.enum(['ONGOING', 'COMPLETED', 'HIATUS']).optional(),
  language: z.enum(['vi', 'en']).optional(),
  mature: z.enum(['true', 'false']).optional(),
  minWords: z.coerce.number().int().min(0).optional(),
  maxWords: z.coerce.number().int().min(0).optional(),
  updated: z.enum(['1', '7', '30']).optional(),
  sort: z.enum(['trending', 'newest', 'reads', 'votes', 'updated']).default('trending'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
export const storyInclude = {
  author: { select: { id: true, name: true, username: true, image: true } },
  category: true,
  tags: { include: { tag: true } },
  _count: {
    select: {
      votes: true,
      library: true,
      chapters: { where: { status: 'PUBLISHED' as const, hiddenAt: null, deletedAt: null } },
    },
  },
} satisfies Prisma.StoryInclude;
export async function browse(input: z.infer<typeof browseInput>, mature = false) {
  const where: Prisma.StoryWhereInput = {
    ...publicWhere(mature),
    ...(input.category ? { category: { slug: input.category } } : {}),
    ...(input.tag ? { tags: { some: { tag: { slug: input.tag } } } } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.language ? { language: input.language } : {}),
    ...(input.mature ? { mature: mature && input.mature === 'true' } : {}),
    wordCount: { gte: input.minWords, lte: input.maxWords },
    ...(input.updated
      ? { updatedAt: { gte: new Date(Date.now() - Number(input.updated) * 86400_000) } }
      : {}),
  };
  let ranked: string[] | undefined;
  if (input.q) {
    const query = await db.$queryRaw<{ id: string; rank: number }[]>`
      SELECT s.id, ts_rank_cd(s.search_vector, websearch_to_tsquery('simple', immutable_unaccent(${input.q}))) * 10
        + similarity(immutable_unaccent(s.title), immutable_unaccent(${input.q})) * 3 AS rank
      FROM "Story" s
      WHERE s.search_vector @@ websearch_to_tsquery('simple', immutable_unaccent(${input.q}))
        OR immutable_unaccent(s.title) % immutable_unaccent(${input.q})
        OR immutable_unaccent(s.title) ILIKE '%' || immutable_unaccent(${input.q}) || '%'
      ORDER BY rank DESC, s.id LIMIT 1000`;
    ranked = query.map((v) => v.id);
    where.id = { in: ranked };
  }
  const orderBy: Prisma.StoryOrderByWithRelationInput =
    input.sort === 'votes'
      ? { votes: { _count: 'desc' } }
      : input.sort === 'reads'
        ? { reads: 'desc' }
        : input.sort === 'newest'
          ? { createdAt: 'desc' }
          : input.sort === 'updated'
            ? { updatedAt: 'desc' }
            : { trending: 'desc' };
  const all = await db.story.findMany({
    where,
    include: storyInclude,
    orderBy: [orderBy, { id: 'asc' }],
    ...(ranked ? {} : { take: 18, skip: (input.page - 1) * 18 }),
  });
  if (ranked) all.sort((a, b) => ranked!.indexOf(a.id) - ranked!.indexOf(b.id));
  return {
    stories: ranked ? all.slice((input.page - 1) * 18, input.page * 18) : all,
    total: ranked ? all.length : await db.story.count({ where }),
  };
}
export const homeStories = unstable_cache(
  async () => {
    const [featured, trending, updated, categories] = await Promise.all([
      db.story.findMany({
        where: { ...publicWhere(), featured: { isNot: null } },
        include: storyInclude,
        orderBy: { featured: { position: 'asc' } },
        take: 6,
      }),
      db.story.findMany({
        where: publicWhere(),
        include: storyInclude,
        orderBy: { trending: 'desc' },
        take: 8,
      }),
      db.story.findMany({
        where: publicWhere(),
        include: storyInclude,
        orderBy: { updatedAt: 'desc' },
        take: 8,
      }),
      db.category.findMany({ orderBy: { name: 'asc' } }),
    ]);
    return { featured, trending, updated, categories };
  },
  ['home'],
  { revalidate: 60, tags: ['stories'] },
);
export async function suggestions(q: string, user: Actor | null, guest: boolean) {
  const [result, authors, tags] = await Promise.all([
    browse(browseInput.parse({ q }), canMature(user, guest)),
    db.$queryRaw<
      { id: string; name: string | null; username: string }[]
    >`SELECT id,name,username FROM "User" WHERE "deletedAt" IS NULL AND "bannedAt" IS NULL AND (immutable_unaccent(coalesce(name,'')) ILIKE '%'||immutable_unaccent(${q})||'%' OR username ILIKE '%'||${q}||'%') LIMIT 5`,
    db.$queryRaw<
      { name: string; slug: string }[]
    >`SELECT name,slug FROM "Tag" WHERE immutable_unaccent(name) ILIKE '%'||immutable_unaccent(${q})||'%' LIMIT 5`,
  ]);
  return {
    stories: result.stories.slice(0, 5).map((s) => ({ id: s.id, title: s.title, slug: s.slug })),
    authors,
    tags,
  };
}
export async function ranking(period: string, mature = false) {
  const ids = await redis().zrevrange(`ranking:${period}`, 0, 99);
  if (!ids.length) return (await browse(browseInput.parse({ sort: 'trending' }), mature)).stories;
  const stories = await db.story.findMany({
    where: { ...publicWhere(mature), id: { in: ids } },
    include: storyInclude,
  });
  return stories.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
}
