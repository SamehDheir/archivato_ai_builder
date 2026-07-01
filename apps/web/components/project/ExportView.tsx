'use client';

import { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { exportApi } from '@/lib/api';
import { Button } from '@/components/ui/button';

/** Triggers a client-side file download for a string payload. */
function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Opens the Markdown in a print window so the user can "Save as PDF". */
function printAsPdf(markdown: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  const safe = markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  w.document.write(
    `<html><head><title>Archivato Export</title>
     <style>body{font-family:ui-monospace,Consolas,monospace;white-space:pre-wrap;
     padding:32px;line-height:1.45;font-size:12px;color:#111}</style></head>
     <body>${safe}</body></html>`,
  );
  w.document.close();
  w.focus();
  w.print();
}

export function ExportView({ sessionId }: { sessionId: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: string, fn: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const label = (kind: string, text: string) =>
    busy === kind ? 'Preparing…' : text;

  return (
    <div>
      <p className="text-sm text-muted-foreground">
        Download the complete system design in your preferred format.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={!!busy}
          onClick={() =>
            run('json', async () => {
              const data = await exportApi.json(sessionId);
              download(
                `archivato-${sessionId}.json`,
                JSON.stringify(data, null, 2),
                'application/json',
              );
            })
          }
        >
          <Download /> {label('json', 'JSON bundle')}
        </Button>

        <Button
          variant="secondary"
          disabled={!!busy}
          onClick={() =>
            run('md', async () => {
              const md = await exportApi.markdown(sessionId);
              download(`archivato-${sessionId}.md`, md, 'text/markdown');
            })
          }
        >
          <Download /> {label('md', 'Markdown')}
        </Button>

        <Button
          variant="secondary"
          disabled={!!busy}
          onClick={() =>
            run('openapi', async () => {
              const spec = await exportApi.openapi(sessionId);
              download(
                `archivato-${sessionId}-openapi.json`,
                JSON.stringify(spec, null, 2),
                'application/json',
              );
            })
          }
        >
          <Download /> {label('openapi', 'OpenAPI')}
        </Button>

        <Button
          variant="secondary"
          disabled={!!busy}
          onClick={() =>
            run('structure', async () => {
              const s = await exportApi.structure(sessionId);
              download(
                `archivato-${sessionId}-structure.json`,
                JSON.stringify(s, null, 2),
                'application/json',
              );
            })
          }
        >
          <Download /> {label('structure', 'Project structure')}
        </Button>

        <Button
          disabled={!!busy}
          onClick={() =>
            run('pdf', async () => {
              const md = await exportApi.markdown(sessionId);
              printAsPdf(md);
            })
          }
        >
          <Printer /> {label('pdf', 'Print / Save as PDF')}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
