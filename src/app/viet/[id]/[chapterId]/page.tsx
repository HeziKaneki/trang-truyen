import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageUser } from '@/server/page-auth';
import { db } from '@/server/db';
import { ChapterEditor } from '@/components/chapter-editor';
export default async function EditChapter({
  params,
}: {
  params: Promise<{ id: string; chapterId: string }>;
}) {
  const user = await pageUser();
  const { id, chapterId } = await params;
  const chapter = await db.chapter.findFirst({
    where: {
      id: chapterId,
      storyId: id,
      deletedAt: null,
      story: { authorId: user.id, deletedAt: null },
    },
    include: { story: true },
  });
  if (!chapter) notFound();
  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <Link href={`/viet/${id}`} className="mb-8 block text-sm text-primary">
        ← {chapter.story.title}
      </Link>
      <ChapterEditor
        userId={user.id}
        initial={{
          id: chapter.id,
          title: chapter.title,
          html: chapter.html,
          revision: chapter.revision,
          status: chapter.status,
        }}
      />
    </div>
  );
}
