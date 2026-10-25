import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import type { Metadata } from 'next';
import { db } from '@/server/db';
import { publicWhere } from '@/server/services/stories';
import { storyInclude } from '@/server/services/discovery';
import { currentUser, canMature } from '@/server/security';
import { getDictionary } from '@/lib/locale';
import { Cover, StoryGrid, SectionHead } from '@/components/story-card';
import { Toggle, Share, Report } from '@/components/social-actions';
import { Button } from '@/components/ui/button';
import { env } from '@/lib/env';
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const story = await db.story.findFirst({
    where: { slug: (await params).slug, ...publicWhere() },
  });
  if (!story) return { title: 'Trang Truyện', robots: { index: false } };
  return {
    title: story.title,
    description: story.description.slice(0, 160),
    alternates: {
      canonical: `/truyen/${story.slug}`,
      types: { 'application/rss+xml': `/rss/truyen/${story.slug}` },
    },
    openGraph: {
      title: story.title,
      description: story.description.slice(0, 160),
      images: story.cover ? [story.cover] : [],
      type: 'article',
    },
    twitter: { card: story.cover ? 'summary_large_image' : 'summary' },
  };
}
export default async function StoryPage({ params }: Props) {
  const [user, t, c, { slug }] = await Promise.all([
    currentUser(),
    getDictionary(),
    cookies(),
    params,
  ]);
  const story = await db.story.findFirst({
    where: { slug, ...publicWhere(canMature(user, c.get('age-confirmed')?.value === 'true')) },
    include: {
      ...storyInclude,
      chapters: {
        where: { status: 'PUBLISHED', deletedAt: null, hiddenAt: null },
        orderBy: { number: 'asc' },
        select: { id: true, title: true, number: true, wordCount: true, publishedAt: true },
      },
    },
  });
  if (!story) notFound();
  const [saved, voted, related] = await Promise.all([
    user
      ? db.libraryItem.findUnique({
          where: { userId_storyId: { userId: user.id, storyId: story.id } },
        })
      : null,
    user
      ? db.storyVote.findUnique({
          where: { userId_storyId: { userId: user.id, storyId: story.id } },
        })
      : null,
    db.story.findMany({
      where: {
        ...publicWhere(canMature(user)),
        id: { not: story.id },
        OR: [
          { categoryId: story.categoryId },
          { authorId: story.authorId },
          { tags: { some: { tagId: { in: story.tags.map((v) => v.tagId) } } } },
        ],
      },
      include: storyInclude,
      orderBy: { trending: 'desc' },
      take: 6,
    }),
  ]);
  const first = story.chapters[0];
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: story.title,
    description: story.description,
    author: { '@type': 'Person', name: story.author.name },
    url: `${env.APP_URL}/truyen/${story.slug}`,
    inLanguage: story.language,
    ...(story.cover ? { image: `${env.APP_URL}${story.cover}` } : {}),
  };
  return (
    <div className="container-page py-12">
      <script
        nonce={(await headers()).get('x-nonce') || undefined}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }}
      />
      <div className="grid gap-9 md:grid-cols-[230px_1fr]">
        <Cover story={story} className="mx-auto w-48 md:w-full" />
        <div className="max-w-3xl">
          <Link
            href={`/the-loai/${story.category.slug}`}
            className="text-xs uppercase tracking-widest text-primary"
          >
            {story.category.name}
          </Link>
          <h1 className="mt-3 font-serif text-4xl leading-tight sm:text-5xl">{story.title}</h1>
          <Link className="mt-4 inline-block text-sm" href={`/tac-gia/${story.author.username}`}>
            {story.author.name}
          </Link>
          <div className="my-6 flex flex-wrap gap-6 border-y py-4 text-center">
            {[
              [story.reads, t.reads],
              [story._count.votes, t.votes],
              [story.chapters.length, t.chapters],
              [story.wordCount, t.words],
            ].map(([value, label]) => (
              <div key={label}>
                <strong className="block text-lg font-medium">
                  {Number(value).toLocaleString()}
                </strong>
                <span className="text-xs text-foreground/50">{label}</span>
              </div>
            ))}
          </div>
          <div className="mb-5 flex flex-wrap gap-2">
            <span className="chip">{t[story.status]}</span>
            {story.mature && <span className="chip text-red-600">18+</span>}
            {story.tags.map((v) => (
              <Link className="chip" key={v.tagId} href={`/the/${v.tag.slug}`}>
                #{v.tag.name}
              </Link>
            ))}
          </div>
          <p className="whitespace-pre-line text-sm leading-7 text-foreground/70">
            {story.description}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {first && (
              <Button asChild>
                <Link href={`/truyen/${slug}/chuong-${first.number}`}>{t.readFirst}</Link>
              </Button>
            )}
            <Toggle kind="library" endpoint={`library/${story.id}`} initial={!!saved} />
            <Toggle kind="vote" endpoint={`story-votes/${story.id}`} initial={!!voted} />
            <Share />
            <Report targetType="STORY" targetId={story.id} />
          </div>
          <p className="mt-5 text-xs text-foreground/40">
            {t.copyright}: {story.copyright.replaceAll('_', ' ')}
          </p>
        </div>
      </div>
      <section className="my-14 max-w-4xl">
        <SectionHead title={`${t.contents} · ${story.chapters.length}`} />
        <div className="overflow-hidden rounded-2xl border">
          {story.chapters.map((chapter) => (
            <Link
              key={chapter.id}
              className="flex items-center justify-between gap-4 border-b px-5 py-4 text-sm last:border-0 hover:bg-muted"
              href={`/truyen/${slug}/chuong-${chapter.number}`}
            >
              <span>
                <span className="mr-4 text-foreground/35">
                  {String(chapter.number).padStart(2, '0')}
                </span>
                {chapter.title}
              </span>
              <span className="shrink-0 text-xs text-foreground/40">
                {chapter.wordCount} {t.words.toLowerCase()}
              </span>
            </Link>
          ))}
        </div>
      </section>
      <SectionHead title={t.related} />
      <StoryGrid stories={related} t={t} />
    </div>
  );
}
