'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';
import { Bell, BookOpen, Menu, PenLine, Search, X, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useI18n } from './providers';
import { Button } from './ui/button';
import { api } from '@/lib/api';
type SearchResults = {
  stories: { id: string; title: string; slug: string }[];
  authors: { id: string; name: string; username: string }[];
  tags: { slug: string; name: string }[];
};
export function Header({
  user,
  siteName,
}: {
  user: { id: string; name: string | null; username: string; role: string } | null;
  siteName?: string;
}) {
  const t = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      void api<SearchResults>(`search?q=${encodeURIComponent(query)}`)
        .then((data) => {
          if (active) setResults(data);
        })
        .catch(() => {});
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    const refresh = () =>
      void api<{ unread: number }>('notifications')
        .then((v) => {
          if (active) setUnread(v.unread);
        })
        .catch(() => {});
    refresh();
    const source = new EventSource('/api/notifications/stream');
    source.onmessage = refresh;
    const interval = setInterval(refresh, 30000);
    return () => {
      active = false;
      source.close();
      clearInterval(interval);
    };
  }, [user]);
  const nav = [
    [t.explore, '/kham-pha'],
    [t.rankings, '/xep-hang'],
    [t.library, '/thu-vien'],
  ];
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="container-page flex h-20 items-center gap-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 font-serif text-xl font-bold tracking-tight"
        >
          <img src="/brand.svg" alt="" width={34} height={34} />
          {siteName || t.brand}
        </Link>
        <nav className="hidden items-center gap-6 text-sm lg:flex">
          {nav.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className={
                pathname === href ? 'text-primary' : 'text-foreground/65 hover:text-primary'
              }
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="relative ml-auto hidden w-60 xl:block">
          <form action="/kham-pha">
            <Search className="absolute left-3 top-3 h-4 w-4 text-foreground/40" />
            <input
              aria-label={t.search}
              className="field rounded-full bg-muted/60 pl-9"
              name="q"
              placeholder={t.search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={() => setTimeout(() => setResults(null), 200)}
            />
          </form>
          {results && (
            <div className="absolute left-0 right-0 top-12 rounded-xl border bg-background p-2 shadow-xl">
              {results.stories.map((s) => (
                <Link
                  onClick={() => setQuery('')}
                  className="block rounded-lg p-2 text-sm hover:bg-muted"
                  key={s.id}
                  href={`/truyen/${s.slug}`}
                >
                  {s.title}
                </Link>
              ))}
              {results.authors.map((a) => (
                <Link className="block p-2 text-xs" key={a.id} href={`/tac-gia/${a.username}`}>
                  {t.author}: {a.name}
                </Link>
              ))}
              {results.tags.map((tag) => (
                <Link className="chip m-1" key={tag.slug} href={`/kham-pha?tag=${tag.slug}`}>
                  #{tag.name}
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2 xl:ml-0">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t.theme}
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          >
            <Sun className="hidden h-4 w-4 dark:block" />
            <Moon className="h-4 w-4 dark:hidden" />
          </Button>
          {user ? (
            <>
              <Link href="/thong-bao" aria-label={t.notifications} className="relative p-2">
                <Bell size={19} />
                {unread > 0 && (
                  <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 text-xs text-white">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </Link>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link href="/viet">
                  <PenLine size={14} />
                  {t.write}
                </Link>
              </Button>
            </>
          ) : (
            <Button asChild size="sm">
              <Link href="/dang-nhap">{t.login}</Link>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={t.contents}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </Button>
        </div>
      </div>
      {open && (
        <nav className="container-page grid gap-1 border-t py-4 sm:grid-cols-3">
          {[
            ...nav,
            ...(user
              ? [
                  [t.myStories, '/viet'],
                  [t.settings, '/cai-dat'],
                  [t.profile, `/tac-gia/${user.username}`],
                  [t.analytics, '/thong-ke'],
                  ...(user.role !== 'USER' ? [[t.moderation, '/kiem-duyet']] : []),
                  ...(user.role === 'ADMIN' ? [[t.admin, '/quan-tri']] : []),
                ]
              : [[t.register, '/dang-ky']]),
          ].map(([label, href]) => (
            <Link
              onClick={() => setOpen(false)}
              key={href}
              href={href}
              className="rounded-lg p-3 text-sm hover:bg-muted"
            >
              {label}
            </Link>
          ))}
          <Link href="/kham-pha" onClick={() => setOpen(false)} className="p-3 text-sm">
            <Search className="mr-2 inline" size={15} />
            {t.search}
          </Link>
          {user && (
            <button
              className="p-3 text-left text-sm"
              onClick={() => {
                localStorage.removeItem('editor-current');
                void signOut({ callbackUrl: '/' });
              }}
            >
              {t.logout}
            </button>
          )}
          <button
            className="p-3 text-left text-sm"
            onClick={() => {
              const locale = document.documentElement.lang === 'vi' ? 'en' : 'vi';
              document.cookie = `language=${locale}; Path=/; SameSite=Lax; Max-Age=31536000`;
              router.refresh();
            }}
          >
            {document.documentElement?.lang === 'en' ? 'Tiếng Việt' : 'English'}
          </button>
        </nav>
      )}
    </header>
  );
}
export function Footer() {
  const t = useI18n();
  return (
    <footer className="mt-20 border-t bg-muted/30 py-12">
      <div className="container-page flex flex-wrap items-start justify-between gap-8">
        <div>
          <Link href="/" className="flex items-center gap-2 font-serif text-xl">
            <BookOpen size={22} />
            {t.brand}
          </Link>
          <p className="muted mt-3">{t.footerText}</p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-3 text-xs text-foreground/65">
          {[
            [t.terms, '/dieu-khoan'],
            [t.privacy, '/rieng-tu'],
            [t.guidelines, '/nguyen-tac'],
            [t.takedown, '/ban-quyen'],
          ].map(([label, href]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
