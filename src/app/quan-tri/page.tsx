import { notFound } from 'next/navigation';
import { pageUser } from '@/server/page-auth';
import { db } from '@/server/db';
import { getDictionary } from '@/lib/locale';
import { ApiForm, ActionButton } from '@/components/forms';
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await pageUser();
  if (user.role !== 'ADMIN') notFound();
  const t = await getDictionary();
  const q = ((await searchParams).q || '').slice(0, 100);
  const since = new Date(Date.now() - 30 * 86400_000);
  const [users, categories, tags, words, featured, stories, settings, daily] = await Promise.all([
    db.user.findMany({
      where: q
        ? {
            OR: [
              { username: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {},
      take: 100,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        role: true,
        bannedAt: true,
        suspendedUntil: true,
      },
    }),
    db.category.findMany(),
    db.tag.findMany({ take: 200 }),
    db.bannedWord.findMany(),
    db.featuredStory.findMany({ include: { story: true }, orderBy: { position: 'asc' } }),
    db.story.findMany({
      where: { deletedAt: null, published: true },
      select: { id: true, title: true },
      take: 300,
    }),
    db.siteSetting.findMany(),
    db.$queryRaw<
      { day: Date; users: bigint; stories: bigint; chapters: bigint; reports: bigint }[]
    >`SELECT d.day, (SELECT count(*) FROM "User" WHERE "createdAt"::date=d.day) users, (SELECT count(*) FROM "Story" WHERE "createdAt"::date=d.day) stories, (SELECT count(*) FROM "Chapter" WHERE "createdAt"::date=d.day) chapters, (SELECT count(*) FROM "Report" WHERE "createdAt"::date=d.day) reports FROM generate_series(${since}::date, CURRENT_DATE, '1 day') AS d(day) ORDER BY day DESC`,
  ]);
  return (
    <div className="container-page py-12">
      <h1 className="page-heading">{t.admin}</h1>
      <details className="panel mb-8" open>
        <summary className="section-title cursor-pointer">{t.last30Days}</summary>
        <div className="mt-5 max-h-72 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {[t.day, t.users, t.stories, t.chapters, t.reports].map((v) => (
                  <th key={v} className="p-2">
                    {v}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {daily.map((d) => (
                <tr key={d.day.toISOString()} className="border-t">
                  <td className="p-2">{d.day.toISOString().slice(0, 10)}</td>
                  {[d.users, d.stories, d.chapters, d.reports].map((n, i) => (
                    <td className="p-2" key={i}>
                      {Number(n)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <section className="panel mb-8">
        <h2 className="section-title mb-5">{t.users}</h2>
        <form className="mb-5 flex gap-3">
          <input
            className="field"
            name="q"
            aria-label={t.search}
            defaultValue={q}
            placeholder={t.search}
          />
          <button className="chip">{t.explore}</button>
        </form>
        <div className="max-h-[600px] space-y-4 overflow-auto">
          {users.map((u) => (
            <details key={u.id} className="rounded-xl border p-4">
              <summary className="cursor-pointer text-sm">
                {u.name} · {u.email} · {t[u.role]}
                {u.bannedAt ? ` · ${t.BAN}` : ''}
              </summary>
              <div className="mt-5 grid gap-6 md:grid-cols-2">
                <ApiForm
                  endpoint="admin"
                  base={{ action: 'role', userId: u.id }}
                  fields={[
                    {
                      name: 'role',
                      label: 'role',
                      type: 'select',
                      required: true,
                      value: u.role,
                      options: (['USER', 'MODERATOR', 'ADMIN'] as const).map((value) => ({
                        value,
                        label: t[value],
                      })),
                    },
                  ]}
                />
                <ApiForm
                  endpoint="moderation"
                  base={{ targetType: 'USER', targetId: u.id }}
                  fields={[
                    {
                      name: 'action',
                      label: 'action',
                      type: 'select',
                      required: true,
                      options: (['WARN', 'SUSPEND', 'BAN', 'UNBAN'] as const).map((value) => ({
                        value,
                        label: t[value],
                      })),
                    },
                    { name: 'note', label: 'note', required: true },
                    { name: 'days', label: 'days', type: 'number', value: 7, min: 1, max: 365 },
                  ]}
                />
              </div>
            </details>
          ))}
        </div>
      </section>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="panel">
          <h2 className="section-title mb-5">{t.categories}</h2>
          <ApiForm
            endpoint="admin"
            base={{ action: 'category' }}
            submit="create"
            fields={[{ name: 'name', label: 'name', required: true }]}
          />
          {categories.map((c) => (
            <details key={c.id} className="mt-4 border-t pt-3">
              <summary className="cursor-pointer text-sm">{c.name}</summary>
              <div className="my-4">
                <ApiForm
                  endpoint="admin"
                  base={{ action: 'category', id: c.id }}
                  fields={[{ name: 'name', label: 'name', value: c.name, required: true }]}
                />
              </div>
              <ActionButton
                endpoint="admin"
                body={{ action: 'delete-category', id: c.id }}
                label="delete"
              />
            </details>
          ))}
        </section>
        <section className="panel">
          <h2 className="section-title mb-5">{t.tags}</h2>
          <ApiForm
            endpoint="admin"
            base={{ action: 'tag' }}
            submit="create"
            fields={[{ name: 'name', label: 'name', required: true }]}
          />
          <div className="my-6 max-h-64 overflow-auto">
            {tags.map((tag) => (
              <details key={tag.id} className="border-t py-3 text-sm">
                <summary className="cursor-pointer">{tag.name}</summary>
                <div className="my-4">
                  <ApiForm
                    endpoint="admin"
                    base={{ action: 'tag', id: tag.id }}
                    fields={[{ name: 'name', label: 'name', value: tag.name, required: true }]}
                  />
                </div>
                <ActionButton
                  endpoint="admin"
                  body={{ action: 'delete-tag', id: tag.id }}
                  label="delete"
                />
              </details>
            ))}
          </div>
          <h3 className="mb-4 font-serif text-xl">{t.mergeTags}</h3>
          <ApiForm
            endpoint="admin"
            base={{ action: 'merge-tags' }}
            fields={[
              {
                name: 'sourceId',
                label: 'sourceTag',
                type: 'select',
                required: true,
                options: tags.map((tag) => ({ value: tag.id, label: tag.name })),
              },
              {
                name: 'targetId',
                label: 'targetTag',
                type: 'select',
                required: true,
                options: tags.map((tag) => ({ value: tag.id, label: tag.name })),
              },
            ]}
          />
        </section>
        <section className="panel">
          <h2 className="section-title mb-5">{t.bannedWords}</h2>
          <ApiForm
            endpoint="admin"
            base={{ action: 'banned-word', enabled: true }}
            submit="create"
            fields={[{ name: 'word', label: 'word', required: true }]}
          />
          {words.map((w) => (
            <div
              key={w.id}
              className="mt-3 flex items-center justify-between border-t pt-3 text-sm"
            >
              <span>{w.word}</span>
              <ActionButton
                endpoint="admin"
                body={{ action: 'banned-word', word: w.word, enabled: false }}
                label="delete"
              />
            </div>
          ))}
        </section>
        <section className="panel">
          <h2 className="section-title mb-5">{t.featuredManage}</h2>
          <ApiForm
            endpoint="admin"
            base={{ action: 'featured', enabled: true }}
            fields={[
              {
                name: 'storyId',
                label: 'stories',
                type: 'select',
                required: true,
                options: stories.map((s) => ({ value: s.id, label: s.title })),
              },
              { name: 'position', label: 'position', type: 'number', value: 0, min: 0, max: 100 },
            ]}
          />
          {featured.map((f) => (
            <div
              key={f.storyId}
              className="mt-3 flex items-center justify-between gap-3 border-t pt-3 text-sm"
            >
              <span>
                {f.position}. {f.story.title}
              </span>
              <ActionButton
                endpoint="admin"
                body={{ action: 'featured', storyId: f.storyId, enabled: false }}
                label="delete"
              />
            </div>
          ))}
        </section>
        <section className="panel lg:col-span-2">
          <h2 className="section-title mb-6">{t.siteSettings}</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {(['siteName', 'announcement', 'registrationOpen'] as const).map((key) => (
              <ApiForm
                key={key}
                endpoint="admin"
                base={{ action: 'setting', key }}
                fields={[
                  {
                    name: 'value',
                    label: key,
                    value:
                      settings.find((s) => s.key === key)?.value ||
                      (key === 'registrationOpen' ? 'true' : ''),
                    ...(key === 'registrationOpen'
                      ? {
                          type: 'select',
                          required: true,
                          options: [
                            { value: 'true', label: t.enabled },
                            { value: 'false', label: t.disabled },
                          ],
                        }
                      : { type: 'textarea' }),
                  },
                ]}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
