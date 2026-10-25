import Link from 'next/link';
import { ArrowRight, Sparkles, PenLine } from 'lucide-react';
import { homeStories, storyInclude } from '@/server/services/discovery';
import { currentUser, canMature } from '@/server/security';
import { db } from '@/server/db';
import { publicWhere } from '@/server/services/stories';
import { getDictionary } from '@/lib/locale';
import { Cover, StoryGrid, SectionHead } from '@/components/story-card';
import { Button } from '@/components/ui/button';
export default async function Home() {
  const [data, t, user] = await Promise.all([homeStories(), getDictionary(), currentUser()]);
  const progress = user
    ? await db.readingProgress.findMany({
        where: {
          userId: user.id,
          story: publicWhere(canMature(user)),
          chapter: { status: 'PUBLISHED', hiddenAt: null, deletedAt: null },
        },
        include: { story: { include: storyInclude }, chapter: true },
        orderBy: { updatedAt: 'desc' },
        take: 3,
      })
    : [];
  const hero = data.featured.length ? data.featured : data.trending;
  return (
    <div className="container-page">
      <section className="relative my-7 grid overflow-hidden rounded-3xl bg-[#eaf0e9] px-7 py-12 dark:bg-[#20342a] sm:px-12 lg:grid-cols-[1.2fr_1fr] lg:py-16">
        <div className="relative z-10 max-w-xl">
          <p className="mb-6 text-[10px] font-semibold tracking-[.18em] text-primary">
            {t.heroEyebrow}
          </p>
          <h1 className="whitespace-pre-line font-serif text-4xl leading-[1.16] tracking-tight sm:text-5xl lg:text-[56px]">
            {t.heroTitle}
          </h1>
          <p className="mt-5 max-w-sm text-sm leading-7 text-foreground/60">{t.heroDescription}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/kham-pha">
                {t.startReading}
                <ArrowRight size={16} />
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/viet">{t.startWriting}</Link>
            </Button>
          </div>
        </div>
        <div
          className="relative mt-12 flex items-center justify-center gap-[-10px] lg:mt-0"
          aria-hidden="true"
        >
          <div className="absolute h-64 w-64 rounded-full border border-primary/10 sm:h-80 sm:w-80" />
          <div className="absolute h-52 w-52 rounded-full border border-primary/10 sm:h-64 sm:w-64" />
          {hero.slice(0, 3).map((story, i) => (
            <div
              key={story.id}
              className={`relative w-28 sm:w-36 ${i === 1 ? 'z-10 -translate-y-3 rotate-3' : i === 0 ? 'translate-x-3 rotate-[-12deg]' : '-translate-x-3 rotate-[13deg]'}`}
            >
              <Cover story={story} />
            </div>
          ))}
        </div>
      </section>
      <section className="py-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="mr-3 text-xs font-medium text-foreground/55">{t.categories}</span>
          {data.categories.map((c) => (
            <Link className="chip bg-background px-4 py-2" key={c.id} href={`/the-loai/${c.slug}`}>
              {c.name}
            </Link>
          ))}
        </div>
      </section>
      {progress.length > 0 && (
        <section className="py-8">
          <SectionHead title={t.continueReading} />
          <div className="grid gap-4 md:grid-cols-3">
            {progress.map((p) => (
              <Link
                className="panel flex gap-4 p-4"
                key={p.storyId}
                href={`/truyen/${p.story.slug}/chuong-${p.chapter.number}`}
              >
                <Cover story={p.story} className="w-14 shrink-0" />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-serif">{p.story.title}</h3>
                  <p className="muted mt-2 truncate">{p.chapter.title}</p>
                  <progress className="mt-3 h-1 w-full accent-primary" value={p.position} max={1} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
      <section className="py-9">
        <SectionHead title={t.featured} href="/kham-pha" label={t.seeAll} />
        <StoryGrid stories={data.featured} t={t} />
      </section>
      <section className="border-t py-10">
        <SectionHead title={t.trending} href="/xep-hang" label={t.seeAll} />
        <StoryGrid stories={data.trending.slice(0, 6)} t={t} />
      </section>
      <section className="my-5 flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-primary/15 bg-primary/5 px-8 py-9">
        <div className="flex gap-5">
          <div className="hidden rounded-full bg-primary/10 p-4 sm:block">
            <PenLine className="text-primary" size={26} />
          </div>
          <div>
            <h2 className="font-serif text-2xl">{t.newVoices}</h2>
            <p className="muted mt-2 max-w-lg leading-6">{t.joinDescription}</p>
          </div>
        </div>
        <Button asChild variant="outline">
          <Link href="/viet">
            <Sparkles size={15} />
            {t.startWriting}
          </Link>
        </Button>
      </section>
      <section className="py-10">
        <SectionHead title={t.updated} href="/kham-pha?sort=updated" label={t.seeAll} />
        <StoryGrid stories={data.updated.slice(0, 6)} t={t} />
      </section>
    </div>
  );
}
