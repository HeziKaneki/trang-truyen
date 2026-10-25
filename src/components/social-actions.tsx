'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Heart, Bookmark, UserPlus, Share2, Flag, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useError, useI18n } from './providers';
import { Button } from './ui/button';
import { ApiForm } from './forms';
export function Toggle({
  endpoint,
  kind,
  initial = false,
  count,
}: {
  endpoint: string;
  kind: 'vote' | 'library' | 'follow';
  initial?: boolean;
  count?: number;
}) {
  const t = useI18n();
  const showError = useError();
  const [enabled, setEnabled] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [total, setTotal] = useState(count);
  const Icon = kind === 'vote' ? Heart : kind === 'library' ? Bookmark : UserPlus;
  const label =
    kind === 'vote'
      ? enabled
        ? t.voted
        : t.vote
      : kind === 'library'
        ? enabled
          ? t.savedLibrary
          : t.saveLibrary
        : enabled
          ? t.unfollow
          : t.follow;
  return (
    <Button
      size="sm"
      variant={enabled ? 'default' : 'outline'}
      disabled={busy}
      aria-pressed={enabled}
      onClick={async () => {
        const next = !enabled;
        setEnabled(next);
        setBusy(true);
        try {
          const result = await api<{ enabled: boolean; count?: number }>(endpoint, {
            enabled: next,
          });
          setEnabled(result.enabled);
          if (result.count !== undefined) setTotal(result.count);
        } catch (error) {
          setEnabled(!next);
          showError(error);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Icon size={15} fill={enabled && kind === 'vote' ? 'currentColor' : 'none'} />
      {label}
      {total !== undefined && <span>{total}</span>}
    </Button>
  );
}
export function Share() {
  const t = useI18n();
  const error = useError();
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() =>
        void navigator.clipboard
          .writeText(location.href)
          .then(() => toast.success(t.copied))
          .catch(error)
      }
    >
      <Share2 size={15} />
      {t.share}
    </Button>
  );
}
export function Report({
  targetType,
  targetId,
}: {
  targetType: 'STORY' | 'CHAPTER' | 'COMMENT' | 'USER';
  targetId: string;
}) {
  const t = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => dialog.current?.showModal()}>
        <Flag size={13} />
        {t.report}
      </Button>
      <dialog
        ref={dialog}
        className="w-[min(90vw,480px)] rounded-2xl border bg-background p-6 text-foreground shadow-2xl backdrop:bg-black/40"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-serif text-xl">{t.report}</h2>
          <Button
            size="icon"
            variant="ghost"
            aria-label={t.close}
            onClick={() => dialog.current?.close()}
          >
            <X size={18} />
          </Button>
        </div>
        <p className="muted mb-4 break-all">
          {t.targetId}: {targetId}
        </p>
        <ApiForm
          endpoint="reports"
          base={{ targetType, targetId }}
          submit="submit"
          fields={[
            {
              name: 'reason',
              label: 'reason',
              type: 'select',
              required: true,
              options: (['SPAM', 'ABUSE', 'SEXUAL', 'VIOLENCE', 'COPYRIGHT', 'OTHER'] as const).map(
                (value) => ({ value, label: t[value] }),
              ),
            },
            { name: 'note', label: 'note', type: 'textarea', required: true, max: 5000 },
          ]}
          onSuccess={() => dialog.current?.close()}
        />
      </dialog>
    </>
  );
}
export function AgeGate() {
  const t = useI18n();
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-xs">
      <input
        type="checkbox"
        className="accent-primary"
        onChange={(e) => {
          document.cookie = `age-confirmed=${e.target.checked}; Path=/; SameSite=Lax; Max-Age=86400`;
          router.refresh();
        }}
      />
      {t.ageConfirm}
    </label>
  );
}
