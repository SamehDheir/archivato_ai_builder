'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Printer } from 'lucide-react';
import { exportApi } from '@/lib/api';
import { saveBlob, saveFile as download } from '@/lib/download';
import { Button } from '@/components/ui/button';
import { ScaffoldView } from './ScaffoldView';
import { ShareLinkCard } from './ShareLinkCard';

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
  const { t } = useTranslation('stages');
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
    busy === kind ? t('export.preparing') : text;

  return (
    <div>
      <p className="text-sm text-muted-foreground">{t('export.intro')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={!!busy}
          onClick={() =>
            run('all', async () => {
              const blob = await exportApi.all(sessionId);
              saveBlob(`archivato-${sessionId}.zip`, blob);
            })
          }
        >
          <Download /> {label('all', t('export.all'))}
        </Button>

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
          <Download /> {label('json', t('export.jsonBundle'))}
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
          <Download /> {label('md', t('export.markdown'))}
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
          <Download /> {label('openapi', t('export.openapiJson'))}
        </Button>

        <Button
          variant="secondary"
          disabled={!!busy}
          onClick={() =>
            run('openapi-yaml', async () => {
              const yaml = await exportApi.openapiYaml(sessionId);
              download(
                `archivato-${sessionId}-openapi.yaml`,
                yaml,
                'application/yaml',
              );
            })
          }
        >
          <Download /> {label('openapi-yaml', t('export.openapiYaml'))}
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
          <Download /> {label('structure', t('export.structure'))}
        </Button>

        <Button
          variant="secondary"
          disabled={!!busy}
          onClick={() =>
            run('sql', async () => {
              const sql = await exportApi.sql(sessionId);
              download(`archivato-${sessionId}-schema.sql`, sql, 'application/sql');
            })
          }
        >
          <Download /> {label('sql', t('export.sql'))}
        </Button>

        <Button
          variant="secondary"
          disabled={!!busy}
          onClick={() =>
            run('postman', async () => {
              const col = await exportApi.postman(sessionId);
              download(
                `archivato-${sessionId}-postman.json`,
                JSON.stringify(col, null, 2),
                'application/json',
              );
            })
          }
        >
          <Download /> {label('postman', t('export.postman'))}
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
          <Printer /> {label('pdf', t('export.pdf'))}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <ShareLinkCard sessionId={sessionId} />
      <ScaffoldView sessionId={sessionId} />
    </div>
  );
}
