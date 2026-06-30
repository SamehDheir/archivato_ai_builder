'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Renders Mermaid source to SVG client-side (mermaid.js, dynamically imported so
 * it stays code-split). Falls back to showing the source if a diagram fails to
 * parse. Shared by the Diagrams tab and the inline ER diagram on the Database
 * Design view.
 */
export function MermaidView({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const id = `mmd-${Math.random().toString(36).slice(2)}`;
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'strict',
        });
        // Validate BEFORE rendering: on a parse error mermaid.render injects its
        // "Syntax error" bomb graphic into document.body and leaves it there,
        // littering every page. parse({ suppressErrors }) returns falsy instead.
        const ok = await mermaid.parse(code, { suppressErrors: true });
        if (!ok) throw new Error('Invalid Mermaid syntax');
        // NB: mermaid gives the returned <svg> this same `id`, so never
        // getElementById(id).remove() afterwards — that would delete the diagram
        // we just inserted. The parse() pre-check above is what prevents the
        // "bomb" graphic; no body-level cleanup is needed on the success path.
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
