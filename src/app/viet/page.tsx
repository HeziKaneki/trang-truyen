import Link from 'next/link';
import { pageUser } from '@/server/page-auth';
import { db } from '@/server/db';
import { getDictionary } from '@/lib/locale';
import { Button } from '@/components/ui/button';
import { ActionButton } from '@/components/forms';
import { Cover, Empty } from '@/components/story-card';
export default async function WritingDashboard() {
  const user = await pageUser();
  const t = await getDictionary();
  const stories = await db.story.findMany({
    where: { authorId: user.id },
    include: {
      _count: { select: { votes: true, library: true } },
      chapters: { select: { _count: { select: { comments: true } } } },
    },
    orderBy: { updatedAt: 'desc' },
  });
  return (
    <div className="container-page py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="page-heading mb-0">{t.myStories}</h1>
        <Button asChild>
          <Link href="/viet/moi">{t.newStory}</Link>
        </Button>
      </div>
      {!user.emailVerified && (
        <div className="mb-6 rounded-xl bg-amber-100 p-4 text-sm text-amber-950">
          {t.verifyNotice}
          <div className="mt-3">
            <ActionButton
              endpoint="resend-verification"
              body={{ email: user.email }}
              label="resend"
            />
          </div>
        </div>
      )}
      {stories.length === 0 && <Empty text={t.empty} />}
      <div className="space-y-4">
        {stories.map((s) => (
          <article key={s.id} className="panel flex flex-wrap items-center gap-6">
            <Cover story={s} className="w-20 shrink-0" />
            <div className="min-w-0 flex-1">
              <Link href={`/viet/${s.id}`} className="font-serif text-xl">
                {s.title}
              </Link>
              <p className="muted mt-2">{s.deletedAt ? t.trash : t[s.status]}</p>
              <div className="mt-4 flex flex-wrap gap-4 text-xs text-foreground/60">
                <span>
                  {s.reads} {t.reads}
                </span>
                <span>
                  {s._count.votes} {t.votes}
                </span>
                <span>
                  {s.chapters.reduce((n, c) => n + c._count.comments, 0)} {t.comments}
                </span>
                <span>
                  {s._count.library} {t.followers}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {s.deletedAt ? (
                <ActionButton
                  endpoint={`stories/${s.id}/lifecycle`}
                  body={{ action: 'restore' }}
                  label="restore"
                />
              ) : (
                <>
                  <Button size="sm" asChild variant="outline">
                    <Link href={`/viet/${s.id}`}>{t.edit}</Link>
                  </Button>
                  <ActionButton
                    endpoint={`stories/${s.id}/lifecycle`}
                    body={{ action: 'unpublish' }}
                    label="unpublish"
                  />
                  <ActionButton
                    endpoint={`stories/${s.id}/lifecycle`}
                    body={{ action: 'delete' }}
                    label="delete"
                    confirm
                  />
                </>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
