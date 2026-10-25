import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageUser } from '@/server/page-auth';
import { db } from '@/server/db';
import { getDictionary } from '@/lib/locale';
import { StoryForm } from '@/components/story-form';
import { ChapterList } from '@/components/chapter-list';
import { ApiForm } from '@/components/forms';
export default async function EditStory({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser();
  const { id } = await params;
  const [story, categories, t] = await Promise.all([
    db.story.findFirst({
      where: { id, authorId: user.id, deletedAt: null },
      include: { tags: { include: { tag: true } }, chapters: { orderBy: { number: 'asc' } } },
    }),
    db.category.findMany(),
    getDictionary(),
  ]);
  if (!story) notFound();
  return (
    <div className="container-page py-12">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-heading mb-0">{story.title}</h1>
        {story.published && (
          <Link href={`/truyen/${story.slug}`} className="text-sm text-primary">
            {t.viewPublic} ↗
          </Link>
        )}
      </div>
      <div className="grid gap-8 lg:grid-cols-[1fr_1.35fr]">
        <section className="panel">
          <h2 className="section-title mb-6">{t.storyDetails}</h2>
          <StoryForm t={t} categories={categories} story={story} />
        </section>
        <section>
          <div className="panel">
            <h2 className="section-title mb-5">{t.chapters}</h2>
            <ChapterList
              key={story.chapters.map((c) => `${c.id}-${c.deletedAt}`).join()}
              storyId={id}
              chapters={story.chapters.map((c) => ({
                id: c.id,
                title: c.title,
                status: c.status,
                number: c.number,
                deletedAt: c.deletedAt?.toISOString() || null,
              }))}
            />
          </div>
          <div className="panel mt-6">
            <h3 className="mb-4 font-serif text-xl">{t.newChapter}</h3>
            <ApiForm
              endpoint={`stories/${id}/chapters`}
              submit="create"
              redirect={`/viet/${id}/:id`}
              fields={[{ name: 'title', label: 'chapterTitle', required: true }]}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
