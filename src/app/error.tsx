'use client';
import { useI18n } from '@/components/providers';
import { Button } from '@/components/ui/button';
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const t = useI18n();
  return (
    <div className="container-page py-28 text-center">
      <h1 className="page-heading">{t.errorTitle}</h1>
      <p className="muted mb-8">{t.errorDescription}</p>
      <Button onClick={reset}>{t.retry}</Button>
    </div>
  );
}
