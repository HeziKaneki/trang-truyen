import Link from 'next/link';
import { pageUser } from '@/server/page-auth';
import { canMature } from '@/server/security';
import { db } from '@/server/db';
import { publicWhere } from '@/server/services/stories';
import { storyInclude } from '@/server/services/discovery';
import { getDictionary } from '@/lib/locale';
import { ApiForm, ActionButton } from '@/components/forms';
import { StoryCard, Empty } from '@/components/story-card';
export default async function Library() {
  const user = await pageUser();
  const t = await getDictionary();
  const [items, lists] = await Promise.all([
    db.libraryItem.findMany({
      where: { userId: user.id, story: publicWhere(canMature(user)) },
      include: {
        story: {
          include: {
            ...storyInclude,
            chapters: {
              where: { status: 'PUBLISHED', deletedAt: null, hiddenAt: null },
              orderBy: { publishedAt: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.readingList.findMany({
      where: { userId: user.id },
      include: {
        items: { where: { story: publicWhere(canMature(user)) }, include: { story: true } },
      },
    }),
  ]);
  return (
    <div className="container-page py-12">
      <h1 className="page-heading">{t.library}</h1>
      {!items.length && <Empty text={t.empty} />}
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((item) => (
          <div key={item.storyId}>
            <StoryCard story={item.story} t={t} />
            {item.story.chapters.some((c) => c.publishedAt && c.publishedAt > item.lastReadAt) && (
              <p className="my-2 text-xs font-semibold text-primary">● {t.newChapters}</p>
            )}
            <div className="mt-3">
              <ActionButton
                endpoint={`library/${item.storyId}`}
                body={{ enabled: false }}
                label="delete"
              />
            </div>
          </div>
        ))}
      </div>
      <h2 className="section-title mb-6 mt-14">{t.readingLists}</h2>
      <div className="grid items-start gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="panel">
          <h3 className="mb-5 font-serif text-xl">{t.newList}</h3>
          <ApiForm
            endpoint="lists"
            base={{ action: 'create' }}
            submit="create"
            fields={[{ name: 'name', label: 'listName', required: true }]}
          />
        </div>
        {lists.map((list) => (
          <section key={list.id} className="panel">
            <ApiForm
              endpoint="lists"
              base={{ action: 'rename', id: list.id }}
              fields={[{ name: 'name', label: 'listName', value: list.name, required: true }]}
            />
            <div className="my-5 space-y-3">
              {list.items.map((item) => (
                <div key={item.storyId} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/truyen/${item.story.slug}`}>{item.story.title}</Link>
                  <ActionButton
                    endpoint="lists"
                    body={{ action: 'item', id: list.id, storyId: item.storyId, enabled: false }}
                    label="removeFromList"
                  />
                </div>
              ))}
            </div>
            {items.length > 0 && (
              <ApiForm
                endpoint="lists"
                base={{ action: 'item', id: list.id, enabled: true }}
                submit="addToList"
                fields={[
                  {
                    name: 'storyId',
                    label: 'stories',
                    type: 'select',
                    required: true,
                    options: items.map((i) => ({ value: i.storyId, label: i.story.title })),
                  },
                ]}
              />
            )}
            <div className="mt-5">
              <ActionButton
                endpoint="lists"
                body={{ action: 'delete', id: list.id }}
                label="delete"
                variant="destructive"
              />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
