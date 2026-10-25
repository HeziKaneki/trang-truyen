import Link from 'next/link';
import { cookies } from 'next/headers';
import { ranking } from '@/server/services/discovery';
import { canMature, currentUser } from '@/server/security';
import { getDictionary } from '@/lib/locale';
import { StoryGrid } from '@/components/story-card';
export default async function Rankings({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const period = (await searchParams).period || 'week';
  const safe = ['today', 'week', 'month', 'all'].includes(period) ? period : 'week';
  const [user, t, c] = await Promise.all([currentUser(), getDictionary(), cookies()]);
  const stories = await ranking(safe, canMature(user, c.get('age-confirmed')?.value === 'true'));
  return (
    <div className="container-page py-12">
      <h1 className="page-heading">{t.rankings}</h1>
      <nav className="mb-9 flex flex-wrap gap-3">
        {[
          [t.day, 'today'],
          [t.week, 'week'],
          [t.month, 'month'],
          [t.allTime, 'all'],
        ].map(([label, value]) => (
          <Link
            className={`chip px-5 py-2 ${value === safe ? 'bg-primary text-white' : ''}`}
            key={value}
            href={`/xep-hang?period=${value}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <StoryGrid stories={stories} t={t} />
    </div>
  );
}
