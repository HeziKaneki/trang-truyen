import Link from 'next/link';
import { cookies } from 'next/headers';
import { browse, browseInput } from '@/server/services/discovery';
import { db } from '@/server/db';
import { currentUser, canMature } from '@/server/security';
import { getDictionary } from '@/lib/locale';
import { StoryGrid } from '@/components/story-card';
import { Button } from '@/components/ui/button';
import { AgeGate } from '@/components/social-actions';
export default async function Explore({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const raw = await searchParams;
  const parsed = browseInput.safeParse(
    Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== '' && v !== undefined)),
  );
  const input = parsed.success ? parsed.data : browseInput.parse({});
  const [user, t, categories, c] = await Promise.all([
    currentUser(),
    getDictionary(),
    db.category.findMany(),
    cookies(),
  ]);
  const result = await browse(input, canMature(user, c.get('age-confirmed')?.value === 'true'));
  const pageUrl = (page: number) =>
    `/kham-pha?${new URLSearchParams({ ...Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === 'string')), page: String(page) })}`;
  return (
    <div className="container-page py-12">
      <p className="mb-3 text-xs uppercase tracking-widest text-primary">{t.explore}</p>
      <h1 className="page-heading">{t.searchTitle}</h1>
      <form className="mb-9 rounded-2xl border bg-muted/30 p-5">
        <div className="mb-4 flex gap-3">
          <input
            name="q"
            defaultValue={input.q}
            className="field flex-1"
            placeholder={t.search}
            aria-label={t.search}
          />
          <Button type="submit">{t.explore}</Button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
          <label className="text-xs">
            {t.category}
            <select name="category" defaultValue={input.category} className="field mt-1">
              <option value="">{t.all}</option>
              {categories.map((v) => (
                <option key={v.id} value={v.slug}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            {t.status}
            <select name="status" defaultValue={input.status} className="field mt-1">
              <option value="">{t.all}</option>
              {(['ONGOING', 'COMPLETED', 'HIATUS'] as const).map((v) => (
                <option key={v} value={v}>
                  {t[v]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            {t.sort}
            <select name="sort" defaultValue={input.sort} className="field mt-1">
              {[
                [t.trending, 'trending'],
                [t.newest, 'newest'],
                [t.mostRead, 'reads'],
                [t.mostVoted, 'votes'],
                [t.recentlyUpdated, 'updated'],
              ].map(([label, value]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            {t.language}
            <select name="language" defaultValue={input.language} className="field mt-1">
              <option value="">{t.all}</option>
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="text-xs">
            {t.lastUpdated}
            <select name="updated" defaultValue={input.updated} className="field mt-1">
              <option value="">{t.all}</option>
              <option value="1">{t.day}</option>
              <option value="7">{t.week}</option>
              <option value="30">{t.month}</option>
            </select>
          </label>
          <label className="text-xs">
            {t.minWords}
            <input
              name="minWords"
              type="number"
              min={0}
              defaultValue={input.minWords}
              className="field mt-1"
            />
          </label>
          <label className="text-xs">
            {t.maxWords}
            <input
              name="maxWords"
              type="number"
              min={0}
              defaultValue={input.maxWords}
              className="field mt-1"
            />
          </label>
          <label className="text-xs">
            {t.tags}
            <input name="tag" defaultValue={input.tag} className="field mt-1" />
          </label>
          <label className="text-xs">
            {t.mature}
            <select name="mature" defaultValue={input.mature} className="field mt-1">
              <option value="">{t.all}</option>
              <option value="true">18+</option>
              <option value="false">{t.disabled}</option>
            </select>
          </label>
        </div>
      </form>
      <div className="mb-6 flex items-center justify-between">
        <p className="muted">
          {result.total} {t.results.toLowerCase()}
        </p>
        {!user && <AgeGate />}
      </div>
      <StoryGrid stories={result.stories} t={t} />
      <nav className="mt-10 flex justify-center gap-3">
        {input.page > 1 && (
          <Button asChild variant="outline">
            <Link href={pageUrl(input.page - 1)}>{t.previous}</Link>
          </Button>
        )}
        {result.total > input.page * 18 && (
          <Button asChild variant="outline">
            <Link href={pageUrl(input.page + 1)}>{t.next}</Link>
          </Button>
        )}
      </nav>
    </div>
  );
}
