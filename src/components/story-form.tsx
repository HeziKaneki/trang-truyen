import type { Category, Prisma } from '@prisma/client';
import { ApiForm } from './forms';
import type { Dictionary } from '@/lib/i18n';
export function StoryForm({
  categories,
  story,
  t,
}: {
  categories: Category[];
  story?: Prisma.StoryGetPayload<{ include: { tags: { include: { tag: true } } } }>;
  t: Dictionary;
}) {
  return (
    <ApiForm
      endpoint={story ? `stories/${story.id}` : 'stories'}
      redirect={story ? undefined : '/viet/:id'}
      method={story ? 'PATCH' : 'POST'}
      fields={[
        { name: 'title', label: 'title', required: true, value: story?.title, max: 180 },
        {
          name: 'description',
          label: 'description',
          type: 'textarea',
          required: true,
          value: story?.description,
          max: 5000,
        },
        { name: 'cover', label: 'cover', type: 'upload', value: story?.cover },
        {
          name: 'categoryId',
          label: 'category',
          type: 'select',
          required: true,
          value: story?.categoryId,
          options: categories.map((c) => ({ value: c.id, label: c.name })),
        },
        {
          name: 'tags',
          label: 'tags',
          type: 'tags',
          value: story?.tags.map((t) => t.tag.name).join(', '),
        },
        {
          name: 'language',
          label: 'language',
          type: 'select',
          required: true,
          value: story?.language || 'vi',
          options: [
            { value: 'vi', label: 'Tiếng Việt' },
            { value: 'en', label: 'English' },
          ],
        },
        {
          name: 'status',
          label: 'status',
          type: 'select',
          required: true,
          value: story?.status || 'ONGOING',
          options: (['ONGOING', 'COMPLETED', 'HIATUS'] as const).map((value) => ({
            value,
            label: t[value],
          })),
        },
        {
          name: 'copyright',
          label: 'copyright',
          type: 'select',
          required: true,
          value: story?.copyright || 'ALL_RIGHTS_RESERVED',
          options: [
            { value: 'ALL_RIGHTS_RESERVED', label: t.copyrightReserved },
            { value: 'CC_BY', label: t.ccBy },
            { value: 'CC_BY_NC', label: t.ccByNc },
            { value: 'PUBLIC_DOMAIN', label: t.publicDomain },
          ],
        },
        { name: 'mature', label: 'mature', type: 'checkbox', value: story?.mature },
      ]}
    />
  );
}
