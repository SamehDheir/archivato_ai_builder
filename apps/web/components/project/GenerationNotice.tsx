'use client';

import { useTranslation } from 'react-i18next';
import { FileWarning } from 'lucide-react';
import {
  degradedReasonOf,
  isDegradedGeneration,
  type GenerationProvenance,
} from '@archivato/shared';
import { Button } from '@/components/ui/button';

/**
 * Warns that an artifact was built by the deterministic fallback rather than by
 * a model — and offers to regenerate it.
 *
 * Why this exists: every agent falls back on failure, which is what keeps the
 * pipeline resilient, and the cost of that design is that **degradation is
 * invisible**. A Pro user paid for an AI-generated document, one transient
 * failure handed them the template, and nothing on the page said so — they then
 * forwarded it to a client. A user who knows can regenerate; a user who doesn't
 * ships it.
 *
 * Renders **nothing** when the artifact is fine, missing, or *unstamped*, so a
 * caller can mount it unconditionally above the artifact it guards — the
 * `StaleNotice` contract. Unstamped means "generated before provenance existed",
 * which is unknown, not degraded.
 */
export function GenerationNotice({
  generation,
  busy,
  onRegenerate,
}: {
  generation: GenerationProvenance | null | undefined;
  busy?: boolean;
  onRegenerate?: () => void;
}) {
  const { t } = useTranslation('stages');

  if (!isDegradedGeneration(generation ?? undefined)) return null;
  const reason = degradedReasonOf(generation ?? undefined);

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/30 bg-warning-subtle p-3 text-small text-warning-subtle-foreground"
    >
      <FileWarning className="h-4 w-4 shrink-0 text-warning" />
      <div className="min-w-0 flex-1" dir="auto">
        <p className="font-medium">{t('generation.title')}</p>
        <p className="opacity-80">{t(`generation.reason.${reason ?? 'call_failed'}`)}</p>
      </div>
      {onRegenerate && (
        <Button
          size="sm"
          variant="secondary"
          onClick={onRegenerate}
          disabled={busy}
          className="ms-auto"
        >
          {busy ? t('generation.working') : t('generation.regenerate')}
        </Button>
      )}
    </div>
  );
}
