'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  GitCompareArrows,
  Lightbulb,
  Scale,
  Sparkles,
  X,
} from 'lucide-react';
import type { DecisionExplanation, DecisionRef } from '@archivato/shared';
import { systemDesignApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * "Why this choice — for your client" — a small ghost trigger next to a design
 * choice (architecture / a tech pick / a service). Clicking opens a modal that
 * asks the API's ArchitectExplainer for the rationale, tradeoffs, alternatives,
 * and risks. The answer is ephemeral (never stored).
 *
 * The label is deliberately about **defending the choice in a client meeting**,
 * not about learning architecture. Same feature, same call — but the person using
 * it is a tech lead being asked "why not just use WordPress?", and the copy should
 * meet them there rather than treating them as a student.
 */
export function ExplainButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation('stages');
  return (
    <Button
      variant="ghost"
      size="sm"
      // The label is a phrase, not a word: keep it on one line so it can't break
      // mid-sentence beside every tech choice.
      className="h-6 gap-1 whitespace-nowrap px-1.5 text-xs text-muted-foreground hover:text-foreground"
      onClick={onClick}
      aria-label={t('system.explain.button')}
    >
      <Sparkles className="h-3.5 w-3.5" />
      {t('system.explain.button')}
    </Button>
  );
}

export function DecisionExplainModal({
  sessionId,
  decision,
  onClose,
}: {
  sessionId: string;
  decision: DecisionRef;
  onClose: () => void;
}) {
  const { t } = useTranslation('stages');
  const [data, setData] = useState<DecisionExplanation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    systemDesignApi
      .explain(sessionId, decision)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, decision]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="explain-title"
        className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl animate-in fade-in zoom-in-95"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-5 pb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
            <h2 id="explain-title" className="text-base font-semibold" dir="auto">
              {data?.title ?? t('system.explain.loadingTitle')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t('system.explain.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          <p className="mb-4 text-xs text-muted-foreground" dir="auto">
            {t('system.explain.intro')}
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}

          {!data && !error && (
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="mt-4 h-24 w-full" />
            </div>
          )}

          {data && (
            <div className="space-y-5" dir="auto">
              <p className="text-sm leading-relaxed">{data.rationale}</p>

              <ExplainList
                icon={Scale}
                tone="text-amber-500"
                title={t('system.explain.tradeoffs')}
                items={data.tradeoffs}
              />

              {data.alternatives.length > 0 && (
                <div>
                  <SectionHead
                    icon={GitCompareArrows}
                    tone="text-sky-500"
                    title={t('system.explain.alternatives')}
                  />
                  <ul className="mt-2 space-y-2">
                    {data.alternatives.map((a, i) => (
                      <li key={i} className="text-sm">
                        <span className="font-medium">{a.name}</span>
                        <span className="text-muted-foreground"> — {a.note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <ExplainList
                icon={AlertTriangle}
                tone="text-rose-500"
                title={t('system.explain.risks')}
                items={data.risks}
              />

              <p className="flex items-center gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
                <Lightbulb className="h-3.5 w-3.5" />
                {t('system.explain.disclaimer')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionHead({
  icon: Icon,
  tone,
  title,
}: {
  icon: typeof Scale;
  tone: string;
  title: string;
}) {
  return (
    <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className={`h-3.5 w-3.5 ${tone}`} />
      {title}
    </h3>
  );
}

function ExplainList({
  icon,
  tone,
  title,
  items,
}: {
  icon: typeof Scale;
  tone: string;
  title: string;
  items: string[];
}) {
  if (!items.length) return null;
  return (
    <div>
      <SectionHead icon={icon} tone={tone} title={title} />
      <ul className="mt-2 space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-sm">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
