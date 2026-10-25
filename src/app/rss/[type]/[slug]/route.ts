import { db } from '@/server/db';
import { publicWhere } from '@/server/services/stories';
import { env } from '@/lib/env';
export const dynamic = 'force-dynamic';
const escape = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
export async function GET(
  _request: Request,
  context: { params: Promise<{ type: string; slug: string }> },
) {
  const { type, slug } = await context.params;
  if (!['truyen', 'tac-gia'].includes(type)) return new Response(null, { status: 404 });
  const chapters = await db.chapter.findMany({
    where: {
      status: 'PUBLISHED',
      deletedAt: null,
      hiddenAt: null,
      story: {
        ...publicWhere(),
        ...(type === 'truyen' ? { slug } : { AND: [{ author: { username: slug } }] }),
      },
    },
    include: { story: { select: { title: true, slug: true } } },
    orderBy: { publishedAt: 'desc' },
    take: 30,
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escape(slug)} · Trang Truyện</title><link>${escape(env.APP_URL)}</link><description>Chương mới / New chapters</description>${chapters
    .map((c) => {
      const url = `${env.APP_URL}/truyen/${c.story.slug}/chuong-${c.number}`;
      return `<item><title>${escape(`${c.story.title} · ${c.title}`)}</title><link>${escape(url)}</link><guid isPermaLink="false">${c.id}</guid><pubDate>${(c.publishedAt || c.createdAt).toUTCString()}</pubDate><description>${escape(c.text.slice(0, 300))}</description></item>`;
    })
    .join('')}</channel></rss>`;
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
    },
  });
}
