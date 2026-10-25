import Explore from '@/app/kham-pha/page';
export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  return Explore({ searchParams: Promise.resolve({ category: (await params).slug }) });
}
