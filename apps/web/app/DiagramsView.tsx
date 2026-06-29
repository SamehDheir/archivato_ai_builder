'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Diagram, ProjectDiagrams } from '@archivato/shared';
import { diagramsApi } from '../lib/api';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * Architecture diagrams: fetches the project's Mermaid source set and renders
 * the selected one to SVG in the browser (mermaid.js). Falls back to showing
 * the source if a diagram fails to render.
 */
export function DiagramsView({
  sessionId,
  reloadKey,
}: {
  sessionId: string;
  reloadKey: number;
}) {
  const [data, setData] = useState<ProjectDiagrams | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await diagramsApi.get(sessionId);
      setData(res);
      setKind(
        (prev) =>
          prev ?? res.diagrams.find((d) => d.mermaid)?.kind ?? res.diagrams[0]?.kind ?? null,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading diagrams…</p>;

  const active: Diagram | undefined =
    data.diagrams.find((d) => d.kind === kind) ?? data.diagrams[0];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={active?.kind} onValueChange={(v) => setKind(v)}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Choose a diagram" />
          </SelectTrigger>
          <SelectContent>
            {data.diagrams.map((d) => (
              <SelectItem key={d.kind} value={d.kind}>
                {d.title}
                {!d.mermaid ? ' (locked)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {active?.mermaid && (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowSource((s) => !s)}
            >
              {showSource ? 'Show diagram' : 'View source'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigator.clipboard?.writeText(active.mermaid)}
            >
              Copy Mermaid
            </Button>
          </>
        )}
      </div>

      {active && !active.mermaid && (
        <p className="text-sm text-muted-foreground">{active.note}</p>
      )}

      {active?.mermaid &&
        (showSource ? (
          <pre className="max-h-[28rem] overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">
            {active.mermaid}
          </pre>
        ) : (
          <MermaidView code={active.mermaid} />
        ))}
    </div>
  );
}

/** Renders Mermaid source to SVG client-side; shows the source on parse error. */
function MermaidView({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'strict',
        });
        const id = `mmd-${Math.random().toString(36).slice(2)}`;
        const { svg } = await mermaid.render(id, code);
        if (active && ref.current) {
          ref.current.innerHTML = svg;
          setError(null);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      active = false;
    };
  }, [code]);

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">
          Couldn’t render this diagram — showing the source instead.
        </p>
        <pre className="max-h-[28rem] overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">
          {code}
        </pre>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="overflow-auto rounded-md border border-border bg-card p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
    />
  );
}
