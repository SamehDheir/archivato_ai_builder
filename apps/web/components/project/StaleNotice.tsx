'use client';

import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import {
  isStale,
  type DerivedArtifact,
  type DerivedStage,
  type UpstreamRevisions,
} from '@archivato/shared';
import { Button } from '@/components/ui/button';

/**
 * Warns that a derived artifact was built from a design that has since changed —
 * by a chat refine, an edit, or a version restore — and offers to regenerate it.
 *
 * It renders **nothing** when the artifact is fresh (or unstamped, or missing),
 * so a caller can mount it unconditionally above the artifact it guards. That's
 * deliberate: the warning belongs next to the content it's about, and this is the
 * only screen where a user can be shown a stale artifact.
 */
export function StaleNotice({
  stage,
  artifact,
  revisions,
  busy,
  onRegenerate,
}: {
  stage: DerivedStage;
  artifact: DerivedArtifact | null | undefined;
  revisions: UpstreamRevisions;
  busy: boolean;
  onRegenerate: () => void;
}) {
  const { t } = useTranslation('stages');

  if (!isStale(stage, artifact, revisions)) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-500/10"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
      <div className="min-w-0 flex-1" dir="auto">
        <p className="font-medium text-amber-900 dark:text-amber-200">
          {t('stale.title')}
        </p>
        <p className="text-amber-800/80 dark:text-amber-200/70">
          {t('stale.description')}
        </p>
      </div>
      <Button
        size="sm"
        variant="secondary"
        onClick={onRegenerate}
        disabled={busy}
        className="ms-auto"
      >
        {busy ? t('stale.working') : t('stale.regenerate')}
      </Button>
    </div>
  );
}
