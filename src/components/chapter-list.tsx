'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowUp, ArrowDown, GripVertical } from 'lucide-react';
import { api } from '@/lib/api';
import { useError, useI18n } from './providers';
import { Button } from './ui/button';
import { ActionButton } from './forms';
export function ChapterList({
  storyId,
  chapters,
}: {
  storyId: string;
  chapters: {
    id: string;
    title: string;
    status: string;
    number: number;
    deletedAt: string | null;
  }[];
}) {
  const t = useI18n();
  const error = useError();
  const [order, setOrder] = useState(chapters.filter((c) => !c.deletedAt));
  const [drag, setDrag] = useState<string | null>(null);
  async function move(from: number, to: number) {
    if (to < 0 || to >= order.length) return;
    const prev = order;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setOrder(next);
    try {
      await api(`stories/${storyId}/reorder`, { ids: next.map((c) => c.id) });
    } catch (e) {
      setOrder(prev);
      error(e);
    }
  }
  return (
    <div>
      <p className="muted mb-3">{t.reorderHint}</p>
      {order.map((c, i) => (
        <div
          className="flex items-center gap-2 border-t py-3"
          key={c.id}
          draggable
          onDragStart={() => setDrag(c.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (drag)
              void move(
                order.findIndex((c) => c.id === drag),
                i,
              );
            setDrag(null);
          }}
        >
          <GripVertical className="hidden text-foreground/30 sm:block" size={16} />
          <Link href={`/viet/${storyId}/${c.id}`} className="mr-auto text-sm">
            {i + 1}. {c.title}
            <span className="ml-3 text-xs text-foreground/40">{t[c.status as 'DRAFT']}</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t.moveUp}
            disabled={i === 0}
            onClick={() => void move(i, i - 1)}
          >
            <ArrowUp size={15} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t.moveDown}
            disabled={i === order.length - 1}
            onClick={() => void move(i, i + 1)}
          >
            <ArrowDown size={15} />
          </Button>
          <ActionButton
            endpoint={`chapters/${c.id}/lifecycle`}
            body={{ action: 'delete' }}
            label="delete"
            confirm
          />
        </div>
      ))}
      {chapters.some((c) => c.deletedAt) && <h3 className="my-4">{t.trash}</h3>}
      {chapters
        .filter((c) => c.deletedAt)
        .map((c) => (
          <div className="flex items-center justify-between border-t py-3 text-sm" key={c.id}>
            <span>{c.title}</span>
            <ActionButton
              endpoint={`chapters/${c.id}/lifecycle`}
              body={{ action: 'restore' }}
              label="restore"
            />
          </div>
        ))}
    </div>
  );
}
