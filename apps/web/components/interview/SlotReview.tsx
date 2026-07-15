'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Pencil, Sparkles } from 'lucide-react';
import {
  SLOT_KEYS,
  type OpenQuestion,
  type SlotKey,
  type SlotMap,
} from '@archivato/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/shared/toast';

/**
 * The scoping review shown at the confirmation gate: the slots the interview
 * filled (inferred values flagged for the owner to correct) plus the questions to
 * forward to the end client.
 *
 * Editing a value calls back to `onEditSlot`, which appends a correction to the
 * transcript server-side — the snapshot here is only a view of that truth. Renders
 * nothing when there's nothing to show (a pure offline/plan-mode run fills no
 * slots), so it never leaves an empty card at the gate.
 */
export function SlotReview({
  slots,
  openQuestions,
  busy,
  onEditSlot,
}: {
  slots: SlotMap;
  openQuestions: OpenQuestion[];
  busy: boolean;
  onEditSlot: (slotKey: string, value: string) => void;
}) {
  const filled = SLOT_KEYS.filter((k) => {
    const s = slots[k];
    return !!s && !s.na && s.value.trim().length > 0;
  });

  if (filled.length === 0 && openQuestions.length === 0) return null;

  return (
    <div className="space-y-5">
      {filled.length > 0 && <FilledSlots keys={filled} slots={slots} busy={busy} onEditSlot={onEditSlot} />}
      {openQuestions.length > 0 && <ClientQuestions items={openQuestions} />}
    </div>
  );
}

function FilledSlots({
  keys,
  slots,
  busy,
  onEditSlot,
}: {
  keys: SlotKey[];
  slots: SlotMap;
  busy: boolean;
  onEditSlot: (slotKey: string, value: string) => void;
}) {
  const { t } = useTranslation('interview');
  const [editing, setEditing] = useState<SlotKey | null>(null);
  const [value, setValue] = useState('');

  function start(key: SlotKey) {
    setValue(slots[key]?.value ?? '');
    setEditing(key);
  }
  function submit(key: SlotKey) {
    const next = value.trim();
    setEditing(null);
    if (next && next !== slots[key]?.value) onEditSlot(key, next);
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">{t('slots.title')}</h4>
      <ul className="space-y-2">
        {keys.map((key) => {
          const slot = slots[key]!;
          const inferred = slot.source === 'inferred';
          return (
            <li
              key={key}
              className="rounded-lg border border-border bg-muted/30 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {t(`slot.${key}`)}
                </span>
                {editing !== key && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => start(key)}
                    className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
                  >
                    <Pencil className="h-3 w-3" />
                    {t('slots.edit')}
                  </button>
                )}
              </div>

              {editing === key ? (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <Input
                    autoFocus
                    dir="auto"
                    value={value}
                    maxLength={2000}
                    aria-label={t(`slot.${key}`)}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submit(key);
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    className="h-8 text-sm"
                  />
                  <Button size="sm" className="h-8 px-2" onClick={() => submit(key)}>
                    {t('slots.save')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2"
                    onClick={() => setEditing(null)}
                  >
                    {t('slots.cancel')}
                  </Button>
                </div>
              ) : (
                <>
                  <p dir="auto" className="mt-0.5 text-sm">
                    {slot.value}
                  </p>
                  {inferred && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500">
                      <Sparkles className="h-3 w-3" />
                      {t('slots.inferred')}
                    </p>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ClientQuestions({ items }: { items: OpenQuestion[] }) {
  const { t } = useTranslation('interview');
  const toast = useToast();
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(text: string, tag: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      window.setTimeout(() => setCopied((c) => (c === tag ? null : c)), 1500);
    } catch {
      toast({ title: t('openQuestions.copyFailed'), variant: 'error' });
    }
  }

  const allText = items.map((q) => `• ${q.questionForClient}`).join('\n');

  return (
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{t('openQuestions.title')}</h4>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={() => copy(allText, '__all__')}
        >
          {copied === '__all__' ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {t('openQuestions.copyAll')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('openQuestions.help')}</p>
      <ul className="space-y-1.5">
        {items.map((q, i) => (
          <li
            key={`${q.slotKey}-${i}`}
            className="flex items-start justify-between gap-2 rounded-md bg-background/60 px-2.5 py-1.5"
          >
            <span dir="auto" className="text-sm">
              {q.questionForClient}
            </span>
            <button
              type="button"
              aria-label={t('openQuestions.copy')}
              title={t('openQuestions.copy')}
              onClick={() => copy(q.questionForClient, `${q.slotKey}-${i}`)}
              className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {copied === `${q.slotKey}-${i}` ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
