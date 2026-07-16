'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, Wand2, X } from 'lucide-react';
import type { FixProposal, PatchSectionKey } from '@archivato/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { diffSection, sectionLabelKey, type DiffLine } from './fix-preview';

/**
 * The approval gate for a drafted fix (R11).
 *
 * Nothing has been written when this opens — the proposal is a draft. Closing it
 * discards the draft; only **Apply** mutates anything. That is the whole point of
 * the component: it is the single place a person looks at a proposed rewrite of a
 * client-facing document and decides. So it shows the real before/after, never a
 * summary of one, and its confirm button says what will happen rather than "OK".
 *
 * A batch proposal renders every section it touches in one modal under one Apply —
 * one approval for one visible set of changes.
 */
export function FixPreviewModal({
  proposal,
  busy,
  onApply,
  onClose,
}: {
  proposal: FixProposal;
  busy: boolean;
  onApply: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('stages');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in"
        onClick={busy ? undefined : onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fix-preview-title"
        className="relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl animate-in fade-in zoom-in-95"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-5 pb-4">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 shrink-0 text-primary" />
            <div>
              <h2 id="fix-preview-title" className="text-base font-semibold">
                {t('review.fix.preview.title')}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('review.fix.preview.subtitle', {
                  count: proposal.sections.length,
                })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            aria-label={t('review.fix.preview.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto p-5">
          {proposal.sections.map((section) => (
            <SectionDiff
              key={section.key}
              sectionKey={section.key}
              rationale={section.rationale}
              before={section.currentContent}
              after={section.proposedContent}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 p-4">
          <p className="text-xs text-muted-foreground">
            {t('review.fix.preview.stale')}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              {t('review.fix.preview.cancel')}
            </Button>
            <Button onClick={onApply} disabled={busy} className="gap-1.5">
              <Check className="h-4 w-4" />
              {busy ? t('review.fix.preview.applying') : t('review.fix.preview.apply')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionDiff({
  sectionKey,
  rationale,
  before,
  after,
}: {
  sectionKey: PatchSectionKey;
  rationale: string;
  before: unknown;
  after: unknown;
}) {
  const { t } = useTranslation('stages');
  const diff = diffSection(before, after);

  return (
    <div className="rounded-lg border border-border">
      <div className="border-b border-border bg-muted/40 px-3 py-2">
        <div className="font-mono text-xs text-muted-foreground" dir="ltr">
          {t(sectionLabelKey(sectionKey), { defaultValue: sectionKey })}
        </div>
        <p className="mt-1 text-sm" dir="auto">
          {rationale}
        </p>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2">
        <DiffColumn
          title={t('review.fix.preview.before')}
          lines={diff.before}
          empty={t('review.fix.preview.emptyBefore')}
        />
        <DiffColumn
          title={t('review.fix.preview.after')}
          lines={diff.after}
          empty={t('review.fix.preview.emptyAfter')}
        />
      </div>
    </div>
  );
}

const LINE_CLASS: Record<DiffLine['kind'], string> = {
  added: 'bg-success/10 text-foreground',
  removed: 'bg-destructive/10 text-muted-foreground line-through',
  same: 'text-muted-foreground',
};

function DiffColumn({
  title,
  lines,
  empty,
}: {
  title: string;
  lines: DiffLine[];
  empty: string;
}) {
  return (
    <div className="bg-card p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {lines.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {lines.map((line, i) => (
            <li
              key={i}
              className={cn('rounded px-1.5 py-1 text-sm', LINE_CLASS[line.kind])}
              dir="auto"
            >
              {line.kind === 'added' && (
                <ArrowRight className="me-1 inline h-3 w-3 text-success rtl:-scale-x-100" />
              )}
              {line.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
