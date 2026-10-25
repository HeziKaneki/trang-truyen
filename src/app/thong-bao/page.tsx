import Link from 'next/link';
import { pageUser } from '@/server/page-auth';
import { db } from '@/server/db';
import { getDictionary } from '@/lib/locale';
import { ActionButton } from '@/components/forms';
import { Empty } from '@/components/story-card';
export default async function Notifications() {
  const user = await pageUser();
  const [t, items] = await Promise.all([
    getDictionary(),
    db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);
  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-heading mb-0">{t.notifications}</h1>
        <ActionButton endpoint="notifications" body={{ all: true }} label="markAllRead" />
      </div>
      {!items.length && <Empty text={t.empty} />}
      <div className="space-y-3">
        {items.map((n) => (
          <article
            className={`panel flex items-center justify-between gap-4 ${!n.readAt ? 'border-primary/30 bg-primary/5' : ''}`}
            key={n.id}
          >
            <Link href={n.url}>
              <p className="text-xs text-primary">{t[n.type]}</p>
              <p className="mt-2 text-sm">{n.title}</p>
              <p className="mt-2 text-xs text-foreground/40">{n.createdAt.toLocaleString()}</p>
            </Link>
            {!n.readAt && (
              <ActionButton endpoint="notifications" body={{ id: n.id }} label="markRead" />
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
