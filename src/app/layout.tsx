import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Providers } from '@/components/providers';
import { Header, Footer } from '@/components/header';
import { currentUser } from '@/server/security';
import { db } from '@/server/db';
import { getLocale, getDictionary } from '@/lib/locale';
import './globals.css';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || 'http://localhost:3000'),
  title: { default: 'Trang Truyện · Mỗi trang sách, một thế giới', template: '%s · Trang Truyện' },
  description:
    'Đọc, viết và khám phá những câu chuyện Việt. Kết nối tác giả và độc giả qua từng trang sách.',
  openGraph: { type: 'website', locale: 'vi_VN', siteName: 'Trang Truyện' },
  twitter: { card: 'summary' },
  icons: { icon: '/brand.svg' },
};
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, locale, t, h, settings] = await Promise.all([
    currentUser(),
    getLocale(),
    getDictionary(),
    headers(),
    db.siteSetting.findMany({ where: { key: { in: ['siteName', 'announcement'] } } }),
  ]);
  const announcement = settings.find((s) => s.key === 'announcement')?.value;
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <Providers locale={locale} nonce={h.get('x-nonce') || undefined}>
          <a
            href="#main"
            className="sr-only z-50 rounded bg-primary p-3 text-white focus:not-sr-only focus:fixed"
          >
            {t.skip}
          </a>
          <Header
            user={
              user
                ? { id: user.id, name: user.name, username: user.username, role: user.role }
                : null
            }
            siteName={settings.find((s) => s.key === 'siteName')?.value}
          />
          {announcement && (
            <div className="bg-primary px-5 py-2 text-center text-sm text-white">
              {announcement}
            </div>
          )}
          <main id="main" className="min-h-[65vh]">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
