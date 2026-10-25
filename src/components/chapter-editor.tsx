'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Image from '@tiptap/extension-image';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Minus,
  Undo,
  Redo,
  ImagePlus,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useError, useI18n } from './providers';
import { Button } from './ui/button';
type Chapter = { id: string; title: string; html: string; revision: number; status: string };
export function ChapterEditor({ initial, userId }: { initial: Chapter; userId: string }) {
  const t = useI18n();
  const showError = useError();
  const [title, setTitle] = useState(initial.title);
  const [state, setState] = useState<'saved' | 'saving' | 'unsaved' | 'offline' | 'conflict'>(
    'saved',
  );
  const [publication, setPublication] = useState(initial.status);
  const [publishAt, setPublishAt] = useState('');
  const [versions, setVersions] = useState<(Chapter & { createdAt: string })[] | null>(null);
  const [publishing, setPublishing] = useState(false);
  const revision = useRef(initial.revision);
  const dirty = useRef(false);
  const saving = useRef(false);
  const locked = useRef(false);
  const generation = useRef(0);
  const titleRef = useRef(title);
  const fileInput = useRef<HTMLInputElement>(null);
  const key = `draft:${userId}:${initial.id}`;
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      Image.configure({ allowBase64: false }),
    ],
    content: initial.html,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        'aria-label': t.editorPlaceholder,
        role: 'textbox',
        'aria-multiline': 'true',
        'data-testid': 'chapter-editor',
      },
    },
    onUpdate: () => markDirty(),
  });
  function markDirty() {
    dirty.current = true;
    generation.current++;
    setState(navigator.onLine ? 'unsaved' : 'offline');
  }
  const snapshot = useCallback(
    () => ({
      title: titleRef.current,
      html: editor?.getHTML() || '',
      revision: revision.current,
      savedAt: Date.now(),
    }),
    [editor],
  );
  const save = useCallback(async () => {
    if (!editor || saving.current || !dirty.current || locked.current) return !dirty.current;
    const data = snapshot();
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      /* In-memory editor remains the fallback if storage is full. */
    }
    if (!navigator.onLine) {
      setState('offline');
      return false;
    }
    saving.current = true;
    setState('saving');
    const at = generation.current;
    try {
      const result = await api<Chapter>(
        `chapters/${initial.id}`,
        { title: data.title, html: data.html, revision: revision.current },
        'PATCH',
      );
      revision.current = result.revision;
      setPublication(result.status);
      if (at === generation.current) {
        dirty.current = false;
        setState('saved');
        localStorage.removeItem(key);
      } else setState('unsaved');
      return !dirty.current;
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VERSION_CONFLICT') {
        locked.current = true;
        setState('conflict');
      } else setState('offline');
      return false;
    } finally {
      saving.current = false;
    }
  }, [editor, initial.id, key, snapshot]);
  useEffect(() => {
    if (!editor) return;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const draft = JSON.parse(raw) as { title: string; html: string; revision: number };
        if (draft.html !== initial.html || draft.title !== initial.title) {
          editor.commands.setContent(draft.html);
          titleRef.current = draft.title;
          setTitle(draft.title);
          dirty.current = true;
          generation.current++;
          if (draft.revision !== initial.revision) {
            locked.current = true;
            setState('conflict');
          } else setState('unsaved');
          toast.info(t.recovery);
        }
      }
    } catch {}
  }, [editor, initial.html, initial.revision, initial.title, key, t.recovery]);
  useEffect(() => {
    const interval = setInterval(() => {
      void save();
    }, 2500);
    const online = () => {
      void save();
    };
    const leave = (event: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      try {
        localStorage.setItem(key, JSON.stringify(snapshot()));
      } catch {}
      event.preventDefault();
      event.returnValue = '';
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') void save();
    };
    window.addEventListener('beforeunload', leave);
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', leave);
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', visibility);
      if (dirty.current) {
        try {
          localStorage.setItem(key, JSON.stringify(snapshot()));
        } catch {}
      }
    };
  }, [save, key, snapshot]);
  useEffect(() => {
    if (state !== 'unsaved') return;
    const timer = setTimeout(() => {
      void save();
    }, 1800);
    return () => clearTimeout(timer);
  }, [state, title, save]);
  async function publish(status: 'DRAFT' | 'PUBLISHED' | 'SCHEDULED') {
    setPublishing(true);
    try {
      if (dirty.current && !(await save())) return;
      const result = await api<Chapter>(`chapters/${initial.id}/publication`, {
        status,
        ...(status === 'SCHEDULED' ? { publishAt: new Date(publishAt).toISOString() } : {}),
      });
      setPublication(result.status);
      toast.success(t[result.status as 'PUBLISHED'] || t.success);
    } catch (error) {
      showError(error);
    } finally {
      setPublishing(false);
    }
  }
  const toolbar = editor
    ? ([
        [t.bold, Bold, () => editor.chain().focus().toggleBold().run()],
        [t.italic, Italic, () => editor.chain().focus().toggleItalic().run()],
        [t.underline, UnderlineIcon, () => editor.chain().focus().toggleUnderline().run()],
        [t.heading, Heading2, () => editor.chain().focus().toggleHeading({ level: 2 }).run()],
        [t.list, List, () => editor.chain().focus().toggleBulletList().run()],
        [t.list, ListOrdered, () => editor.chain().focus().toggleOrderedList().run()],
        [t.quote, Quote, () => editor.chain().focus().toggleBlockquote().run()],
        [t.divider, Minus, () => editor.chain().focus().setHorizontalRule().run()],
        [t.undo, Undo, () => editor.chain().focus().undo().run()],
        [t.redo, Redo, () => editor.chain().focus().redo().run()],
      ] as const)
    : [];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="chip">{t[publication as 'DRAFT'] || publication}</span>
        <span
          data-testid="save-status"
          aria-live="polite"
          className={`mr-auto text-xs ${state === 'offline' || state === 'conflict' ? 'text-red-600' : 'text-foreground/50'}`}
        >
          {t[state]}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void save()}
          disabled={state === 'saving' || state === 'conflict'}
        >
          {t.save}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            void api<(Chapter & { createdAt: string })[]>(`chapters/${initial.id}/versions`)
              .then(setVersions)
              .catch(showError)
          }
        >
          {t.versions}
        </Button>
        <Button
          size="sm"
          disabled={publishing || state === 'conflict'}
          onClick={() => void publish('PUBLISHED')}
        >
          {t.publish}
        </Button>
      </div>
      {(state === 'offline' || state === 'conflict') && (
        <div className="mb-4 flex items-center justify-between rounded-xl bg-amber-100 p-3 text-sm text-amber-950">
          <span>{t[state]}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const url = URL.createObjectURL(new Blob([snapshot().html], { type: 'text/html' }));
              const a = document.createElement('a');
              a.href = url;
              a.download = `${initial.id}.html`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download size={14} />
            {t.exportDraft}
          </Button>
        </div>
      )}
      <input
        aria-label={t.chapterTitle}
        className="mb-6 w-full border-0 border-b bg-transparent py-4 font-serif text-3xl outline-none"
        value={title}
        maxLength={180}
        onChange={(e) => {
          titleRef.current = e.target.value;
          setTitle(e.target.value);
          markDirty();
        }}
      />
      <div className="sticky top-20 z-20 mb-5 flex flex-wrap gap-1 rounded-xl border bg-background p-2">
        {toolbar.map(([label, Icon, fn], i) => (
          <Button key={i} variant="ghost" size="icon" aria-label={label} title={label} onClick={fn}>
            <Icon size={17} />
          </Button>
        ))}
        <Button
          variant="ghost"
          size="icon"
          aria-label={t.image}
          onClick={() => fileInput.current?.click()}
        >
          <ImagePlus size={18} />
        </Button>
        <input
          ref={fileInput}
          type="file"
          hidden
          accept="image/jpeg,image/png,image/webp"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const form = new FormData();
            form.set('file', file);
            try {
              const result = await api<{ url: string }>('uploads', form);
              editor?.chain().focus().setImage({ src: result.url, alt: file.name }).run();
            } catch (error) {
              showError(error);
            }
          }}
        />
      </div>
      <div className="panel">
        <EditorContent editor={editor} />
      </div>
      <p className="muted mt-3 text-right">
        {editor?.getText().trim().split(/\s+/).filter(Boolean).length ?? 0} {t.words.toLowerCase()}
      </p>
      <div className="mt-8 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          {t.publishAt}
          <input
            aria-label={t.publishAt}
            type="datetime-local"
            className="field mt-2"
            value={publishAt}
            onChange={(e) => setPublishAt(e.target.value)}
          />
        </label>
        <Button
          variant="outline"
          disabled={!publishAt || publishing}
          onClick={() => void publish('SCHEDULED')}
        >
          {t.schedule}
        </Button>
        <Button variant="ghost" disabled={publishing} onClick={() => void publish('DRAFT')}>
          {t.unpublish}
        </Button>
      </div>
      {versions && (
        <section className="panel mt-8">
          <div className="mb-4 flex justify-between">
            <h2>{t.versions}</h2>
            <Button size="sm" variant="ghost" onClick={() => setVersions(null)}>
              {t.close}
            </Button>
          </div>
          {versions.length === 0 && <p className="muted">{t.empty}</p>}
          {versions.map((v) => (
            <div key={v.id} className="flex items-center justify-between border-t py-3 text-sm">
              <span>
                #{v.revision} · {v.title} · {new Date(v.createdAt).toLocaleString()}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    if (dirty.current && !(await save())) return;
                    const result = await api<Chapter>(
                      `chapters/${initial.id}/versions/${v.id}`,
                      {},
                    );
                    revision.current = result.revision;
                    editor?.commands.setContent(result.html, false);
                    titleRef.current = result.title;
                    setTitle(result.title);
                    setPublication(result.status);
                    dirty.current = false;
                    locked.current = false;
                    setState('saved');
                    setVersions(null);
                    localStorage.removeItem(key);
                  } catch (e) {
                    showError(e);
                  }
                }}
              >
                {t.restore}
              </Button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
