'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
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
  return (
    <div className="flex h-[560px] items-center justify-center rounded-md border border-border text-sm text-muted-foreground">
      Loading canvas…
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

  /** Switching the sub-view unmounts the other canvas — guard unsaved edits. */
  async function switchMode(next: Mode) {
    if (next === mode) return;
    if (
      dirty &&
      !(await confirm({
        title: 'Discard unsaved canvas changes?',
        description:
          'Switching views will discard the edits you haven’t saved on this canvas.',
        confirmLabel: 'Discard changes',
        cancelLabel: 'Keep editing',
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
          Architecture
        </Button>
        <Button
          size="sm"
          variant={mode === 'database' ? 'default' : 'secondary'}
          onClick={() => switchMode('database')}
        >
          Database
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
            title="No architecture yet"
            description="Generate the system design first (System tab), then drag its services around and wire up dependencies here."
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
          title="No database yet"
          description="Generate the database design first (Database tab), then arrange its entities and draw relations here."
        />
      )}
    </div>
  );
}
