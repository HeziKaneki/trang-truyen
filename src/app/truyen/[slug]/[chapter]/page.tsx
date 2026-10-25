import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { publicWhere } from '@/server/services/stories';
import { currentUser, canMature } from '@/server/security';
import { sanitize } from '@/server/sanitize';
import { Reader } from '@/components/reader';
import { Comments } from '@/components/comments';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; chapter: string }>;
}) {
  const { slug, chapter } = await params;
  const number = Number(chapter.replace('chuong-', ''));
  if (!Number.isSafeInteger(number)) return {};
  const row = await db.chapter.findFirst({
    where: {
      number,
      status: 'PUBLISHED',
      hiddenAt: null,
      deletedAt: null,
      story: { slug, ...publicWhere() },
    },
    select: { title: true, text: true },
  });
  return row
    ? {
        title: row.title,
        description: row.text.slice(0, 160),
        alternates: { canonical: `/truyen/${slug}/${chapter}` },
      }
    : { robots: { index: false } };
}
export default async function ChapterPage({
  params,
}: {
  params: Promise<{ slug: string; chapter: string }>;
}) {
  const { slug, chapter: chapterPath } = await params;
  if (!/^chuong-\d+$/.test(chapterPath)) notFound();
  const number = Number(chapterPath.slice(7));
  const user = await currentUser();
  const mature = canMature(user, (await cookies()).get('age-confirmed')?.value === 'true');
  const chapter = await db.chapter.findFirst({
    where: {
      number,
      status: 'PUBLISHED',
      deletedAt: null,
      hiddenAt: null,
      story: { slug, ...publicWhere(mature) },
    },
    include: {
      story: {
        include: {
          chapters: {
            where: { status: 'PUBLISHED', hiddenAt: null, deletedAt: null },
            select: { id: true, title: true, number: true },
            orderBy: { number: 'asc' },
          },
        },
      },
    },
  });
  if (!chapter) notFound();
  const [progress, vote] = user
    ? await Promise.all([
        db.readingProgress.findUnique({
          where: { userId_storyId: { userId: user.id, storyId: chapter.storyId } },
        }),
        db.chapterVote.findUnique({
          where: { userId_chapterId: { userId: user.id, chapterId: chapter.id } },
        }),
      ])
    : [null, null];
  return (
    <>
      <Reader
        chapter={{
          id: chapter.id,
          title: chapter.title,
          number: chapter.number,
          html: sanitize(chapter.html),
        }}
        story={{ id: chapter.story.id, title: chapter.story.title, slug }}
        chapters={chapter.story.chapters}
        userId={user?.id}
        initialPosition={progress?.chapterId === chapter.id ? progress.position : 0}
        initialSettings={user?.readerSettings}
        voted={!!vote}
      />
      <Comments chapterId={chapter.id} userId={user?.id} authorId={chapter.story.authorId} />
    </>
  );
}
