'use client';

/**
 * Downloads any artifact as a pretty-printed JSON file, client-side.
 * (PDF / Markdown / OpenAPI exports arrive with the Export slice.)
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
    <button type="button" className="secondary download-btn" onClick={handleDownload}>
      ⬇ {label}
    </button>
  );
}
