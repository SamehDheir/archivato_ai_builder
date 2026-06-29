'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Downloads any artifact as a pretty-printed JSON file, client-side.
 */
export function DownloadButton({
  filename,
  data,
  label = 'Download JSON',
}: {
  filename: string;
  data: unknown;
  label?: string;
}) {
  function handleDownload() {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={handleDownload}>
      <Download /> {label}
    </Button>
  );
}
