'use client';

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Loader2, Radio } from 'lucide-react';
import type { StreamStageName } from '@archivato/shared';
import type { StreamView } from '@/lib/stream';

/**
 * The "live" generation console. Presentational: it renders the accumulated
 * `StreamView` (folded from SSE events in the dashboard) as a terminal-style
 * feed — a spinner on the active step, a check on finished ones, and each
 * step's body typed out beneath it.
 *
 * The narration text is server-authored English (matching the project's
 * convention that AI output stays server-side/English); only the chrome is
 * translated. Bodies are `dir="ltr"` monospace since they're code/id-heavy.
 */
export function StreamingConsole({
  stage,
  view,
}: {
  stage: StreamStageName;
  view: StreamView;
}) {
  const { t } = useTranslation('project');
  const endRef = useRef<HTMLDivElement>(null);

  // Follow the tail as content streams in (motion-reduce users get no smooth
  // scroll, just the jump — handled by the browser via prefers-reduced-motion).
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [view]);

  return (
    <div
      className="overflow-hidden rounded-md border border-border bg-muted/30"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs">
        <span className="flex items-center gap-2 font-medium">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary motion-reduce:animate-none" />
          {t('generating', { stage: t(`stage.${stage}`) })}
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
          <Radio className="h-3 w-3 animate-pulse motion-reduce:animate-none" />
          {t('stream.live')}
        </span>
      </div>

      <div className="max-h-72 overflow-y-auto p-3">
        <ol className="space-y-2.5">
          {view.steps.map((step, i) => (
            <li key={`${step.id}-${i}`} className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                {step.done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                ) : (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" />
                )}
                <span className="font-medium">{step.label}</span>
              </div>
              {step.body && (
                <pre
                  dir="ltr"
                  className="ms-6 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-muted-foreground"
                >
                  {step.body}
                  {!step.done && <Caret />}
                </pre>
              )}
            </li>
          ))}
        </ol>
        <div ref={endRef} />
      </div>
    </div>
  );
}

/** A blinking block caret shown at the tail of the actively-typing step. */
function Caret() {
  return (
    <span className="ms-0.5 inline-block h-3 w-1.5 translate-y-0.5 animate-pulse bg-primary motion-reduce:animate-none" />
  );
}
