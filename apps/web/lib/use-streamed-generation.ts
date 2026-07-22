'use client';

import { useCallback, useState } from 'react';
import type { StreamEvent, StreamStageName } from '@archivato/shared';
import { emptyStreamView, reduceStreamEvent, streamStage } from '@/lib/stream';
import type { StreamView } from '@/lib/stream';

/**
 * Run one stage over SSE and accumulate its narration.
 *
 * The design chain got the live console when streaming shipped; the five
 * standalone stages kept a disabled button reading "Generating…" for the same
 * 20–60 seconds, which is the interval where a user decides whether the thing is
 * working or hung. The stages did not differ in any way that justified that —
 * they are the same agents, behind the same provider, with the same fallbacks —
 * so the console is the shared default rather than a design-chain feature.
 *
 * The dashboard keeps its own copy of this fold because it owns the *pipeline's*
 * stream state (one console across five tabs, plus version/project refreshes on
 * completion). Each standalone panel owns its own generation — that is the
 * existing division of labour here — so what they share is this hook, not state.
 *
 * `streamStage` handles the fallback to the plain POST, so a caller never has to
 * know whether SSE was actually available.
 */
export function useStreamedGeneration<T>(
  sessionId: string,
  stage: StreamStageName,
) {
  const [view, setView] = useState<StreamView | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (): Promise<T> => {
    setBusy(true);
    setView(emptyStreamView);
    try {
      return await streamStage<T>(sessionId, stage, (event: StreamEvent) =>
        setView((cur) => (cur ? reduceStreamEvent(cur, event) : cur)),
      );
    } finally {
      setBusy(false);
      setView(null);
    }
  }, [sessionId, stage]);

  return { busy, view, run };
}
