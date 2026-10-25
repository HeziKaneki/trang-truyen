import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { Eye, Heart, ArrowUpRight } from 'lucide-react';
import { storyInclude } from '@/server/services/discovery';
import type { Dictionary } from '@/lib/i18n';
export type StoryCardData = Prisma.StoryGetPayload<{ include: typeof storyInclude }>;
const colors = ['#476d65', '#ad6d53', '#6a6e8c', '#a48a56', '#627889', '#885f6c'];
export function Cover({
  story,
  className = '',
}: {
  story: {
    title: string;
    cover: string | null;
    author?: { name: string | null };
    category?: { name: string };
  };
  className?: string;
}) {
  const color =
    colors[Array.from(story.title).reduce((n, c) => n + c.charCodeAt(0), 0) % colors.length];
  return (
    <div className={`book-cover ${className}`}>
      {story.cover ? (
        <img src={story.cover} alt={story.title} loading="lazy" />
      ) : (
        <div
          className="book-art flex h-full flex-col justify-between p-[12%] text-center text-white"
          style={{ '--cover-color': color } as React.CSSProperties}
        >
          <span className="text-[9px] uppercase tracking-[.22em] opacity-75">
            {story.category?.name}
          </span>
          <span className="font-serif text-[clamp(14px,2.2vw,28px)] leading-tight">
            {story.title}
          </span>
          <div>
            <div className="mx-auto mb-4 h-px w-7 bg-white/50" />
            <span className="text-[10px] tracking-wide opacity-80">{story.author?.name}</span>
          </div>
        </div>
      )}
    </div>
  );
}
export function StoryCard({ story, t }: { story: StoryCardData; t: Dictionary }) {
  return (
    <article className="book-card min-w-0">
      <Link href={`/truyen/${story.slug}`}>
        <Cover story={story} />
        <p className="mt-4 text-[10px] font-semibold uppercase tracking-widest text-primary">
          {story.category.name}
          {story.mature ? ' · 18+' : ''}
        </p>
        <h3 className="mt-1.5 line-clamp-2 font-serif text-lg leading-snug">{story.title}</h3>
      </Link>
      <Link
        className="mt-1.5 block text-xs text-foreground/55"
        href={`/tac-gia/${story.author.username}`}
      >
        {story.author.name}
      </Link>
      <div className="mt-3 flex gap-3 text-[11px] text-foreground/50">
        <span className="flex items-center gap-1" title={t.reads}>
          <Eye size={12} />
          {Intl.NumberFormat('vi', { notation: 'compact' }).format(story.reads)}
        </span>
        <span className="flex items-center gap-1" title={t.votes}>
          <Heart size={11} />
          {story._count.votes}
        </span>
        <span>
          {story._count.chapters} {t.chapters.toLowerCase()}
        </span>
      </div>
    </article>
  );
}
export function StoryGrid({ stories, t }: { stories: StoryCardData[]; t: Dictionary }) {
  return stories.length ? (
    <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {stories.map((story) => (
        <StoryCard key={story.id} story={story} t={t} />
      ))}
    </div>
  ) : (
    <Empty text={t.empty} />
  );
}
export function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed px-6 py-16 text-center text-sm text-foreground/50">
      {text}
    </div>
  );
}
export function SectionHead({
  title,
  href,
  label,
}: {
  title: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <h2 className="section-title">{title}</h2>
      {href && (
        <Link className="flex shrink-0 items-center gap-1 text-xs text-primary" href={href}>
          {label}
          <ArrowUpRight size={14} />
        </Link>
      )}
    </div>
  );
}
