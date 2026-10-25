'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { List, Settings2, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from './providers';
import { Button } from './ui/button';
import { Toggle, Report } from './social-actions';
type Settings = {
  fontSize: number;
  lineHeight: number;
  width: number;
  font: 'serif' | 'sans';
  theme: 'light' | 'dark' | 'sepia';
};
export function Reader({
  chapter,
  story,
  chapters,
  userId,
  initialPosition,
  initialSettings,
  voted,
}: {
  chapter: { id: string; title: string; number: number; html: string };
  story: { id: string; title: string; slug: string };
  chapters: { id: string; title: string; number: number }[];
  userId?: string;
  initialPosition: number;
  initialSettings: unknown;
  voted: boolean;
}) {
  const t = useI18n();
  const [settings, setSettings] = useState<Settings>({
    fontSize: 20,
    lineHeight: 1.9,
    width: 720,
    font: 'serif',
    theme: 'light',
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toc, setToc] = useState(false);
  const [position, setPosition] = useState(0);
  const article = useRef<HTMLElement>(null);
  const ready = useRef(false);
  const progressKey = `progress:${userId || 'guest'}:${story.id}`;
  const index = chapters.findIndex((c) => c.id === chapter.id);
  const previous = chapters[index - 1];
  const next = chapters[index + 1];
  useEffect(() => {
    try {
      const saved =
        initialSettings || JSON.parse(localStorage.getItem('reader-settings') || 'null');
      if (saved && typeof saved === 'object')
        setSettings((current) => ({ ...current, ...(saved as Partial<Settings>) }));
      const progress = JSON.parse(localStorage.getItem(progressKey) || 'null');
      const pos = userId
        ? initialPosition
        : progress?.chapterId === chapter.id
          ? progress.position
          : 0;
      setTimeout(() => {
        if (article.current && pos > 0)
          window.scrollTo({
            top:
              article.current.offsetTop +
              pos * Math.max(1, article.current.offsetHeight - window.innerHeight),
          });
        ready.current = true;
      }, 250);
    } catch {
      ready.current = true;
    }
    void api(`reads/${chapter.id}`, {}).catch(() => {});
  }, [chapter.id, initialPosition, initialSettings, progressKey, userId]);
  useEffect(() => {
    localStorage.setItem('reader-settings', JSON.stringify(settings));
    if (!userId || !ready.current) return;
    const timer = setTimeout(() => {
      void api('account', { action: 'reader', settings }).catch(() => {});
    }, 700);
    return () => clearTimeout(timer);
  }, [settings, userId]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const scroll = () => {
      if (!article.current || !ready.current) return;
      const value = Math.max(
        0,
        Math.min(
          1,
          (window.scrollY - article.current.offsetTop) /
            Math.max(1, article.current.offsetHeight - window.innerHeight),
        ),
      );
      setPosition(value);
      localStorage.setItem(
        progressKey,
        JSON.stringify({
          chapterId: chapter.id,
          number: chapter.number,
          slug: story.slug,
          position: value,
        }),
      );
      clearTimeout(timer);
      if (userId)
        timer = setTimeout(() => {
          void api('progress', { chapterId: chapter.id, position: value }).catch(() => {});
        }, 1200);
    };
    window.addEventListener('scroll', scroll, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', scroll);
    };
  }, [chapter.id, chapter.number, progressKey, story.slug, userId]);
  return (
    <div className={`reader-${settings.theme} min-h-screen pb-12`}>
      <div className="sticky top-20 z-30 border-b border-current/10 bg-inherit">
        <div className="container-page flex h-14 items-center gap-2">
          <Link href={`/truyen/${story.slug}`} className="mr-auto truncate text-sm">
            {story.title}
          </Link>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t.contents}
            aria-expanded={toc}
            onClick={() => setToc(!toc)}
          >
            <List size={19} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t.readerSettings}
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            <Settings2 size={19} />
          </Button>
        </div>
        <progress
          max={1}
          value={position}
          aria-label={t.progress}
          className="absolute bottom-0 h-0.5 w-full accent-primary"
        />
        {settingsOpen && (
          <div className="container-page grid gap-3 py-5 text-sm sm:grid-cols-3">
            <label>
              {t.fontSize}
              <input
                aria-label={t.fontSize}
                className="block w-full accent-primary"
                type="range"
                min={14}
                max={32}
                value={settings.fontSize}
                onChange={(e) => setSettings({ ...settings, fontSize: Number(e.target.value) })}
              />
            </label>
            <label>
              {t.lineHeight}
              <input
                aria-label={t.lineHeight}
                className="block w-full accent-primary"
                type="range"
                min={1.4}
                max={2.4}
                step={0.1}
                value={settings.lineHeight}
                onChange={(e) => setSettings({ ...settings, lineHeight: Number(e.target.value) })}
              />
            </label>
            <label>
              {t.width}
              <input
                aria-label={t.width}
                className="block w-full accent-primary"
                type="range"
                min={500}
                max={1000}
                value={settings.width}
                onChange={(e) => setSettings({ ...settings, width: Number(e.target.value) })}
              />
            </label>
            <label>
              {t.font}
              <select
                className="field mt-1"
                value={settings.font}
                onChange={(e) =>
                  setSettings({ ...settings, font: e.target.value as Settings['font'] })
                }
              >
                <option value="serif">{t.serif}</option>
                <option value="sans">{t.sans}</option>
              </select>
            </label>
            <label>
              {t.theme}
              <select
                className="field mt-1"
                value={settings.theme}
                onChange={(e) =>
                  setSettings({ ...settings, theme: e.target.value as Settings['theme'] })
                }
              >
                {(['light', 'dark', 'sepia'] as const).map((v) => (
                  <option key={v} value={v}>
                    {t[v]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {toc && (
          <nav className="container-page max-h-72 overflow-y-auto py-4">
            {chapters.map((c) => (
              <Link
                key={c.id}
                className="block rounded p-2 text-sm hover:bg-black/5"
                href={`/truyen/${story.slug}/chuong-${c.number}`}
              >
                {c.number}. {c.title}
              </Link>
            ))}
          </nav>
        )}
      </div>
      <article
        ref={article}
        className="mx-auto px-6 py-12 sm:py-16"
        style={{
          maxWidth: settings.width,
          fontSize: settings.fontSize,
          lineHeight: settings.lineHeight,
          fontFamily: settings.font === 'serif' ? 'Georgia, serif' : 'Arial, sans-serif',
        }}
      >
        <p className="mb-5 text-center text-xs uppercase tracking-widest opacity-50">
          {t.chapters} {chapter.number}
        </p>
        <h1 className="mb-12 text-center font-serif text-[1.8em] leading-tight">{chapter.title}</h1>
        <div className="prose-story" dangerouslySetInnerHTML={{ __html: chapter.html }} />
        <p className="mt-16 text-center text-xs opacity-50">✦ · ✦ · ✦</p>
      </article>
      <div className="mx-auto max-w-3xl px-5 text-center">
        <p className="muted mb-6">{t.endChapter}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Toggle kind="vote" endpoint={`chapter-votes/${chapter.id}`} initial={voted} />
          <Report targetType="CHAPTER" targetId={chapter.id} />
        </div>
        <nav className="mt-10 flex justify-between gap-4">
          {previous ? (
            <Button asChild variant="outline">
              <Link href={`/truyen/${story.slug}/chuong-${previous.number}`}>
                <ChevronLeft size={16} />
                {t.previousChapter}
              </Link>
            </Button>
          ) : (
            <span />
          )}
          {next && (
            <Button asChild>
              <Link href={`/truyen/${story.slug}/chuong-${next.number}`}>
                {t.nextChapter}
                <ChevronRight size={16} />
              </Link>
            </Button>
          )}
        </nav>
      </div>
    </div>
  );
}
