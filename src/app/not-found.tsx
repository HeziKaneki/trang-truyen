import Link from 'next/link';
import { getDictionary } from '@/lib/locale';
import { Button } from '@/components/ui/button';
export default async function NotFound() {
  const t = await getDictionary();
  return (
    <div className="container-page py-28 text-center">
      <p className="font-serif text-7xl text-primary/30">404</p>
      <h1 className="page-heading mt-6">{t.notFound}</h1>
      <p className="muted mb-8">{t.notFoundDescription}</p>
      <Button asChild>
        <Link href="/">{t.home}</Link>
      </Button>
    </div>
  );
}
