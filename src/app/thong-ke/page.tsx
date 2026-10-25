import { pageUser } from '@/server/page-auth';
import { analytics } from '@/server/services/analytics';
import { getDictionary } from '@/lib/locale';
export default async function AnalyticsPage() {
  const user = await pageUser();
  const [data, t] = await Promise.all([analytics(user), getDictionary()]);
  const max = Math.max(1, ...data.days.map((d) => d.reads));
  return (
    <div className="container-page py-12">
      <h1 className="page-heading">{t.analytics}</h1>
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {[
          [t.reads, data.stories.reduce((n, s) => n + s.reads, 0)],
          [t.votes, data.stories.reduce((n, s) => n + s._count.votes, 0)],
          [t.followers, data.days.reduce((n, d) => n + d.followers, 0)],
        ].map(([label, value]) => (
          <div className="panel" key={label}>
            <p className="muted">{label}</p>
            <p className="mt-4 font-serif text-4xl">{value}</p>
          </div>
        ))}
      </div>
      <section className="panel">
        <h2 className="section-title mb-6">{t.last30Days}</h2>
        <svg
          viewBox="0 0 900 200"
          role="img"
          aria-label={`${t.reads} · ${t.last30Days}`}
          className="mb-6 w-full text-primary"
        >
          {data.days.map((d, i) => (
            <g key={d.day}>
              <title>
                {d.day}: {d.reads} {t.reads}
              </title>
              <rect
                x={i * 30 + 3}
                y={175 - (d.reads / max) * 160}
                width={22}
                height={Math.max(1, (d.reads / max) * 160)}
                rx={3}
                fill="currentColor"
              />
              {i % 5 === 0 && (
                <text x={i * 30} y={195} fill="currentColor" fontSize={9}>
                  {d.day.slice(5)}
                </text>
              )}
            </g>
          ))}
        </svg>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t.last30Days}</caption>
            <thead>
              <tr className="border-b">
                {[t.day, t.reads, t.votes, t.comments, t.followers].map((label) => (
                  <th className="p-3 font-medium" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.days.map((d) => (
                <tr className="border-b last:border-0" key={d.day}>
                  <td className="p-3">{d.day}</td>
                  <td className="p-3">{d.reads}</td>
                  <td className="p-3">{d.votes}</td>
                  <td className="p-3">{d.comments}</td>
                  <td className="p-3">{d.followers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel mt-8">
        <h2 className="section-title mb-5">{t.topChapters}</h2>
        {data.chapters.map((c) => (
          <div key={c.id} className="flex flex-wrap justify-between gap-3 border-t py-4 text-sm">
            <span>
              {c.story.title} · {c.title}
            </span>
            <span className="muted">
              {c.reads} {t.reads} · {c._count.votes} {t.votes} · {c._count.comments} {t.comments}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}
