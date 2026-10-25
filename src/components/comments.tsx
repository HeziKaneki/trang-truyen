'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useError, useI18n } from './providers';
import { Button } from './ui/button';
import { Report } from './social-actions';
type Comment = {
  id: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  user: { id: string; name: string | null; username: string };
  replies?: Comment[];
};
export function Comments({
  chapterId,
  userId,
  authorId,
}: {
  chapterId: string;
  userId?: string;
  authorId: string;
}) {
  const t = useI18n();
  const showError = useError();
  const [items, setItems] = useState<Comment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [reply, setReply] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<{ id: string; body: string } | null>(null);
  const load = useCallback(
    async (next?: string) => {
      const data = await api<{ items: Comment[]; nextCursor: string | null }>(
        `comments/${chapterId}${next ? `?cursor=${next}` : ''}`,
      );
      setItems((v) => (next ? [...v, ...data.items] : data.items));
      setCursor(data.nextCursor);
    },
    [chapterId],
  );
  useEffect(() => {
    void load().catch(() => {});
  }, [load]);
  async function change(
    id: string,
    action: 'edit' | 'delete' | 'pin',
    extra: Record<string, unknown> = {},
  ) {
    try {
      await api(`comments/${id}`, { action, ...extra }, 'PATCH');
      await load();
      setEdit(null);
    } catch (e) {
      showError(e);
    }
  }
  function renderComment(c: Comment, child = false) {
    return (
      <div key={c.id} className={`border-t py-5 ${child ? 'ml-7 border-l pl-4' : ''}`}>
        <div className="mb-2 flex items-center gap-3">
          <Link href={`/tac-gia/${c.user.username}`} className="text-sm font-semibold">
            {c.user.name || c.user.username}
          </Link>
          <span className="text-[11px] text-foreground/40">
            {new Date(c.createdAt).toLocaleDateString()}
          </span>
          {c.pinned && <span className="chip py-0.5">{t.pinned}</span>}
        </div>
        {edit?.id === c.id ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void change(c.id, 'edit', { body: edit.body });
            }}
          >
            <textarea
              aria-label={t.edit}
              value={edit.body}
              onChange={(e) => setEdit({ id: c.id, body: e.target.value })}
              className="field"
              required
              maxLength={3000}
            />
            <Button size="sm">{t.save}</Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setEdit(null)}>
              {t.cancel}
            </Button>
          </form>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-7">{c.body}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-1">
          {userId && !child && (
            <Button variant="ghost" size="sm" onClick={() => setReply(c.id)}>
              {t.reply}
            </Button>
          )}
          {userId === c.user.id && (
            <Button variant="ghost" size="sm" onClick={() => setEdit({ id: c.id, body: c.body })}>
              {t.edit}
            </Button>
          )}
          {userId && (userId === c.user.id || userId === authorId) && (
            <Button variant="ghost" size="sm" onClick={() => void change(c.id, 'delete')}>
              {t.delete}
            </Button>
          )}
          {userId === authorId && !child && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void change(c.id, 'pin', { pinned: !c.pinned })}
            >
              {c.pinned ? t.unpin : t.pin}
            </Button>
          )}
          {userId && <Report targetType="COMMENT" targetId={c.id} />}
        </div>
        {c.replies?.map((r) => renderComment(r, true))}
      </div>
    );
  }
  return (
    <section id="comments" className="mx-auto mt-12 max-w-3xl border-t px-5 pt-10">
      <h2 className="section-title mb-6">{t.comments}</h2>
      {userId ? (
        <form
          className="mb-6"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            const previous = items;
            const text = body;
            const optimistic: Comment = {
              id: `pending-${Date.now()}`,
              body,
              pinned: false,
              createdAt: new Date().toISOString(),
              user: { id: userId, name: t.saving, username: '' },
            };
            if (!reply) setItems((v) => [optimistic, ...v]);
            setBusy(true);
            setBody('');
            try {
              await api(`comments/${chapterId}`, {
                body: text,
                ...(reply ? { parentId: reply } : {}),
              });
              setReply(null);
              await load();
            } catch (error) {
              setItems(previous);
              setBody(text);
              showError(error);
            } finally {
              setBusy(false);
            }
          }}
        >
          {reply && (
            <p className="muted mb-2">
              {t.reply}{' '}
              <button type="button" onClick={() => setReply(null)}>
                {t.cancel}
              </button>
            </p>
          )}
          <textarea
            aria-label={t.comments}
            placeholder={t.commentPlaceholder}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            maxLength={3000}
            className="field min-h-24"
          />
          <Button className="mt-3" size="sm" disabled={busy}>
            {t.submit}
          </Button>
        </form>
      ) : (
        <Link className="mb-5 block text-sm text-primary" href="/dang-nhap">
          {t.loginToComment}
        </Link>
      )}
      {items.map((c) => renderComment(c))}
      {cursor && (
        <Button variant="outline" onClick={() => void load(cursor).catch(showError)}>
          {t.loadMore}
        </Button>
      )}
    </section>
  );
}
