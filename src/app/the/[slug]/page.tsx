import Explore from '@/app/kham-pha/page';
export default async function TagPage({ params }: { params: Promise<{ slug: string }> }) {
  return Explore({ searchParams: Promise.resolve({ tag: (await params).slug }) });
}
