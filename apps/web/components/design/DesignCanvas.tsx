'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Database as DatabaseIcon, Network } from 'lucide-react';
import type { DatabaseDesign, SystemDesign } from '@archivato/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/EmptyState';
import { useConfirm } from '@/components/shared/confirm-dialog';

// React Flow touches the DOM and ships a large bundle → client-only + code-split.
const ArchitectureCanvas = dynamic(
  () => import('./ArchitectureCanvas').then((m) => m.ArchitectureCanvas),
  { ssr: false, loading: () => <CanvasLoading /> },
);
const DatabaseCanvas = dynamic(
  () => import('./DatabaseCanvas').then((m) => m.DatabaseCanvas),
  { ssr: false, loading: () => <CanvasLoading /> },
);

function CanvasLoading() {
  const { t } = useTranslation('stages');
  return (
    <div className="flex h-[560px] items-center justify-center rounded-md border border-border text-sm text-muted-foreground">
      {t('canvas.loading')}
    </div>
  );
}

type Mode = 'architecture' | 'database';

/**
 * Interactive design canvas (React Flow): drag/add/delete services or entities
 * and draw their dependencies/relations, then save back to the design. Layout
 * positions persist per-project in the browser.
 */
export function DesignCanvas({
  sessionId,
  design,
  dbDesign,
  dirty,
  onDirty,
  onSavedDesign,
  onSavedDbDesign,
}: {
  sessionId: string;
  design: SystemDesign | null;
  dbDesign: DatabaseDesign | null;
  dirty: boolean;
  onDirty: (dirty: boolean) => void;
  onSavedDesign: (design: SystemDesign) => void;
  onSavedDbDesign: (design: DatabaseDesign) => void;
}) {
  const [mode, setMode] = useState<Mode>('architecture');
  const confirm = useConfirm();
  const { t } = useTranslation('stages');

  /** Switching the sub-view unmounts the other canvas — guard unsaved edits. */
  async function switchMode(next: Mode) {
    if (next === mode) return;
    if (
      dirty &&
      !(await confirm({
        title: t('canvas.discardTitle'),
        description: t('canvas.discardDescription'),
        confirmLabel: t('canvas.discardConfirm'),
        cancelLabel: t('canvas.discardCancel'),
        destructive: true,
      }))
    ) {
      return;
    }
    onDirty(false);
    setMode(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        <Button
          size="sm"
          variant={mode === 'architecture' ? 'default' : 'secondary'}
          onClick={() => switchMode('architecture')}
        >
          {t('canvas.architecture')}
        </Button>
        <Button
          size="sm"
          variant={mode === 'database' ? 'default' : 'secondary'}
          onClick={() => switchMode('database')}
        >
          {t('canvas.database')}
        </Button>
      </div>

      {mode === 'architecture' ? (
        design ? (
          <ArchitectureCanvas
            design={design}
            sessionId={sessionId}
            onDirty={onDirty}
            onSaved={onSavedDesign}
          />
        ) : (
          <EmptyState
            icon={Network}
            title={t('canvas.noArchTitle')}
            description={t('canvas.noArchDescription')}
          />
        )
      ) : dbDesign ? (
        <DatabaseCanvas
          design={dbDesign}
          sessionId={sessionId}
          onDirty={onDirty}
          onSaved={onSavedDbDesign}
        />
      ) : (
        <EmptyState
          icon={DatabaseIcon}
          title={t('canvas.noDbTitle')}
          description={t('canvas.noDbDescription')}
        />
      )}
    </div>
  );
}
