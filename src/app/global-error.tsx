'use client';
import { vi } from '@/lib/i18n';
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="vi">
      <body style={{ padding: '10vh 10vw', fontFamily: 'sans-serif' }}>
        <h1>{vi.errorTitle}</h1>
        <p>{vi.errorDescription}</p>
        <button onClick={reset}>{vi.retry}</button>
      </body>
    </html>
  );
}
