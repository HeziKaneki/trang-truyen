import { notFound } from 'next/navigation';
import { pageUser } from '@/server/page-auth';
import { db } from '@/server/db';
import { getDictionary } from '@/lib/locale';
import { ApiForm } from '@/components/forms';
import { Empty } from '@/components/story-card';
export default async function ModerationPage() {
  const user = await pageUser();
  if (user.role === 'USER') notFound();
  const [t, reports, audit] = await Promise.all([
    getDictionary(),
    db.report.findMany({ where: { status: 'OPEN' }, orderBy: { createdAt: 'asc' }, take: 100 }),
    db.moderationAction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { moderator: { select: { name: true } } },
    }),
  ]);
  const subjects = await Promise.all(
    reports.map(async (r) => {
      if (r.targetType === 'STORY') {
        const s = await db.story.findUnique({ where: { id: r.targetId } });
        return s ? `${s.title}\n${s.description}` : '';
      }
      if (r.targetType === 'CHAPTER') {
        const c = await db.chapter.findUnique({ where: { id: r.targetId } });
        return c ? `${c.title}\n${c.text}` : '';
      }
      if (r.targetType === 'COMMENT')
        return (await db.comment.findUnique({ where: { id: r.targetId } }))?.body || '';
      const u = await db.user.findUnique({
        where: { id: r.targetId },
        select: { name: true, bio: true },
      });
      return u ? `${u.name}\n${u.bio}` : '';
    }),
  );
  return (
    <div className="container-page py-12">
      <h1 className="page-heading">{t.moderation}</h1>
      {!reports.length && <Empty text={t.empty} />}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        {reports.map((r, i) => (
          <article key={r.id} className="panel">
            <p className="text-xs text-primary">
              {r.targetType} · {t[r.reason as 'SPAM'] || r.reason} ·{' '}
              {r.createdAt.toLocaleDateString()}
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm">{r.note}</p>
            <details className="my-5 rounded-xl bg-muted p-4 text-sm">
              <summary className="cursor-pointer">
                {t.about} · {r.targetId}
              </summary>
              <p className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap leading-7">
                {subjects[i]}
              </p>
            </details>
            <ApiForm
              endpoint="moderation"
              submit="submit"
              base={{ reportId: r.id, targetType: r.targetType, targetId: r.targetId }}
              fields={[
                {
                  name: 'action',
                  label: 'action',
                  type: 'select',
                  required: true,
                  options: (r.targetType === 'USER'
                    ? (['WARN', 'SUSPEND', 'BAN', 'UNBAN', 'DISMISS'] as const)
                    : r.targetType === 'CHAPTER'
                      ? (['HIDE', 'REMOVE', 'RESTORE', 'APPROVE', 'DISMISS'] as const)
                      : (['HIDE', 'REMOVE', 'RESTORE', 'DISMISS'] as const)
                  ).map((value) => ({ value, label: t[value] })),
                },
                { name: 'note', label: 'note', type: 'textarea', required: true },
                ...(r.targetType === 'USER'
                  ? [
                      {
                        name: 'days',
                        label: 'days' as const,
                        type: 'number' as const,
                        value: 7,
                        min: 1,
                        max: 365,
                      },
                    ]
                  : []),
              ]}
            />
          </article>
        ))}
      </div>
      <section className="panel mt-10">
        <h2 className="section-title mb-6">{t.audit}</h2>
        {audit.map((a) => (
          <div className="border-t py-4 text-sm" key={a.id}>
            <p>
              {a.moderator.name} · {t[a.action as 'HIDE'] || a.action} · {a.targetType} ·{' '}
              {a.targetId}
            </p>
            <p className="muted mt-2">
              {a.note} · {a.createdAt.toLocaleString()}
            </p>
            {['HIDE', 'REMOVE'].includes(a.action) && (
              <details className="mt-3">
                <summary className="cursor-pointer text-primary">{t.restore}</summary>
                <ApiForm
                  endpoint="moderation"
                  base={{ targetType: a.targetType, targetId: a.targetId, action: 'RESTORE' }}
                  submit="restore"
                  fields={[{ name: 'note', label: 'note', required: true }]}
                />
              </details>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
