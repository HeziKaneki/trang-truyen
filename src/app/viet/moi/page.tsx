import { pageUser } from '@/server/page-auth';
import { db } from '@/server/db';
import { getDictionary } from '@/lib/locale';
import { StoryForm } from '@/components/story-form';
export default async function NewStory() {
  await pageUser();
  const [t, categories] = await Promise.all([getDictionary(), db.category.findMany()]);
  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="page-heading">{t.newStory}</h1>
      <div className="panel">
        <StoryForm categories={categories} t={t} />
      </div>
    </div>
  );
}
