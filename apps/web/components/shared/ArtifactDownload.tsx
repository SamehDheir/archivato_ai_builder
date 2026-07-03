'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** One downloadable representation of an artifact. */
export interface DownloadFormat {
  /** Button label, e.g. "Markdown", "Prisma", "SQL", "JSON". */
  label: string;
  /** File extension without the dot, e.g. "md", "prisma", "sql", "json". */
  ext: string;
  /** MIME type for the blob. */
  mime: string;
  /** Builds the file contents lazily (on click), so nothing runs until used. */
  build: () => string;
}

/** Save a string to the user's disk as a client-side download. */
function save(content: string, filename: string, mime: string) {
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

/**
 * Per-stage artifact download offering one or more formats. The **first** format
 * is the prominent primary action; the rest are secondary. Every format is built
 * client-side, so this stays free (no Pro-gated Export endpoint) and offline.
 */
export function ArtifactDownload({
  basename,
  formats,
}: {
  /** File name without extension, e.g. `database-design-<sessionId>`. */
  basename: string;
  formats: DownloadFormat[];
}) {
  const [primary, ...rest] = formats;
  if (!primary) return null;

  return (
    <div className="inline-flex items-center gap-1">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() =>
          save(primary.build(), `${basename}.${primary.ext}`, primary.mime)
        }
        title={`Download as ${primary.label}`}
      >
        <Download /> {primary.label}
      </Button>
      {rest.map((f) => (
        <Button
          key={f.ext}
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => save(f.build(), `${basename}.${f.ext}`, f.mime)}
          title={`Download as ${f.label}`}
        >
          {f.label}
        </Button>
      ))}
    </div>
  );
}
