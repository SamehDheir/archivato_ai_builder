'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Printer,
  Send,
  Users,
} from 'lucide-react';
import { sharePath } from '@archivato/shared';
import { exportApi, shareApi } from '@/lib/api';
import { saveBlob, saveFile as download } from '@/lib/download';
import { Button } from '@/components/ui/button';
import { ScaffoldView } from './ScaffoldView';

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

/**
 * The export surface, organised by **who the output is for** (R12) rather than by
 * file format.
 *
 * The old version was a flat row of nine equal buttons — JSON, Markdown, OpenAPI
 * JSON, OpenAPI YAML, structure, SQL, Postman, zip, PDF — which asked the owner
 * to know what a Postman collection is before they could send a client anything.
 * There are really only two intents here: get the proposal in front of the buyer,
 * and get the spec in front of the devs. Everything else is a format detail, so it
 * moves behind "More formats". **Nothing was removed** — every export that existed
 * is still one or two clicks away.
 */
export function ExportView({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation('stages');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

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

  /**
   * Mint-or-fetch the client link and copy it. `shareApi.create` is idempotent, so
   * "first send" and "send again" are the same call and a link already sitting in
   * a client's inbox is never rotated out from under them.
   */
  async function sendToClient() {
    await run('client', async () => {
      const link = await shareApi.create(sessionId);
      const url = `${window.location.origin}${sharePath(link.token)}`;
      setShareUrl(url);
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{t('export.intro')}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Primary A — the deal. */}
        <PrimaryCard
          icon={Send}
          title={t('export.client.title')}
          body={t('export.client.body')}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={!!busy} onClick={() => void sendToClient()}>
              <Copy />
              {copied
                ? t('export.client.copied')
                : label('client', t('export.client.cta'))}
            </Button>
            {shareUrl && (
              <a
                href={shareUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t('export.client.preview')}
              </a>
            )}
          </div>
        </PrimaryCard>

        {/* Primary B — the handoff. */}
        <PrimaryCard
          icon={Users}
          title={t('export.team.title')}
          body={t('export.team.body')}
        >
          <Button
            disabled={!!busy}
            onClick={() =>
              run('all', async () => {
                const blob = await exportApi.all(sessionId);
                saveBlob(`archivato-${sessionId}.zip`, blob);
              })
            }
          >
            <Download /> {label('all', t('export.team.cta'))}
          </Button>
        </PrimaryCard>
      </div>

      {/* Every individual format, unchanged — one click further away, not gone. */}
      <MoreFormats label={t('export.more')}>
        <FormatItem
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
          label={label('json', t('export.jsonBundle'))}
        />
        <FormatItem
          onClick={() =>
            run('md', async () => {
              const md = await exportApi.markdown(sessionId);
              download(`archivato-${sessionId}.md`, md, 'text/markdown');
            })
          }
          label={label('md', t('export.markdown'))}
        />
        <FormatItem
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
          label={label('openapi', t('export.openapiJson'))}
        />
        <FormatItem
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
          label={label('openapi-yaml', t('export.openapiYaml'))}
        />
        <FormatItem
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
          label={label('structure', t('export.structure'))}
        />
        <FormatItem
          onClick={() =>
            run('sql', async () => {
              const sql = await exportApi.sql(sessionId);
              download(`archivato-${sessionId}-schema.sql`, sql, 'application/sql');
            })
          }
          label={label('sql', t('export.sql'))}
        />
        <FormatItem
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
          label={label('postman', t('export.postman'))}
        />
        <FormatItem
          icon={Printer}
          onClick={() =>
            run('pdf', async () => {
              const md = await exportApi.markdown(sessionId);
              printAsPdf(md);
            })
          }
          label={label('pdf', t('export.pdf'))}
        />
      </MoreFormats>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* The public share link also lives in the project header — it's free on
          every plan, while this whole tab is Pro. */}
      <ScaffoldView sessionId={sessionId} />
    </div>
  );
}

function PrimaryCard({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon: typeof Send;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <p className="mt-1.5 flex-1 text-xs text-muted-foreground" dir="auto">
        {body}
      </p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/**
 * The "More formats" menu. Same mechanics as the header dropdowns (outside-click
 * + Escape to close, `end-0` so it opens the right way in RTL).
 */
function MoreFormats({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="gap-1.5 text-muted-foreground"
      >
        {label}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform${open ? ' rotate-180' : ''}`}
        />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute end-0 z-40 mt-1 min-w-56 rounded-lg border border-border bg-card p-1 shadow-lg"
        >
          {children}
        </div>
      )}
    </div>
  );
}

function FormatItem({
  icon: Icon = Download,
  label,
  onClick,
}: {
  icon?: typeof Download;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-start text-sm hover:bg-muted"
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      {label}
    </button>
  );
}
