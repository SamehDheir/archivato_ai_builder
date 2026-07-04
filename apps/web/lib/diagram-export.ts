'use client';

/**
 * Client-side diagram exporters. Given a **rendered** SVG element (e.g. the
 * Mermaid ER diagram in the DOM), produce downloadable SVG / PNG files or a
 * print-to-PDF window. No dependencies — uses the browser's XMLSerializer,
 * canvas, and print pipeline. Draw.io / Mermaid source are plain strings built
 * elsewhere and saved via `downloadString`.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A background considered "none" (skip the backing rect / canvas fill). */
function isTransparent(bg: string): boolean {
  return (
    !bg ||
    bg === 'transparent' ||
    bg.replace(/\s/g, '').startsWith('rgba(0,0,0,0')
  );
}

/** Intrinsic size of an SVG (viewBox first, then measured box). */
export function svgSize(svg: SVGSVGElement): { width: number; height: number } {
  const vb = svg.viewBox?.baseVal;
  if (vb && vb.width && vb.height) {
    return { width: vb.width, height: vb.height };
  }
  const r = svg.getBoundingClientRect();
  return { width: Math.round(r.width) || 800, height: Math.round(r.height) || 600 };
}

/**
 * Serialize a live SVG to a standalone `<svg>` string with explicit dimensions
 * and (optionally) a solid background rect so the export isn't transparent. No
 * XML prolog — callers that write a `.svg` file prepend one.
 */
export function serializeSvg(svg: SVGSVGElement, background?: string): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const { width, height } = svgSize(svg);
  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  if (background && !isTransparent(background)) {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', '0');
    rect.setAttribute('y', '0');
    rect.setAttribute('width', '100%');
    rect.setAttribute('height', '100%');
    rect.setAttribute('fill', background);
    clone.insertBefore(rect, clone.firstChild);
  }
  return new XMLSerializer().serializeToString(clone);
}

/** Trigger a browser download for a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Trigger a browser download for a string payload. */
export function downloadString(content: string, filename: string, mime: string): void {
  downloadBlob(new Blob([content], { type: mime }), filename);
}

/** Save the rendered SVG as a standalone `.svg` file. */
export function exportSvgFile(
  svg: SVGSVGElement,
  filename: string,
  background?: string,
): void {
  const doc =
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' +
    serializeSvg(svg, background);
  downloadString(doc, filename, 'image/svg+xml');
}

/** Rasterize the rendered SVG to a PNG Blob (default 2× for crispness). */
export async function svgToPngBlob(
  svg: SVGSVGElement,
  background?: string,
  scale = 2,
): Promise<Blob> {
  const source = serializeSvg(svg, background);
  const { width, height } = svgSize(svg);
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source);

  const img = new Image();
  img.width = width;
  img.height = height;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Could not rasterize the diagram.'));
    img.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available.');
  if (background && !isTransparent(background)) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('PNG encoding failed.'))),
      'image/png',
    );
  });
}

/** Save the rendered SVG as a PNG file. */
export async function exportPngFile(
  svg: SVGSVGElement,
  filename: string,
  background?: string,
): Promise<void> {
  downloadBlob(await svgToPngBlob(svg, background), filename);
}

/**
 * Open a print window containing the (vector) SVG so the user can "Save as PDF".
 * The backing rect is embedded in the SVG, so the background survives even when
 * the print dialog's "background graphics" option is off.
 */
export function printSvgAsPdf(
  svg: SVGSVGElement,
  title: string,
  background?: string,
): boolean {
  const source = serializeSvg(svg, background);
  const w = window.open('', '_blank');
  if (!w) return false; // popup blocked
  w.document.write(
    `<!doctype html><html><head><title>${title}</title>` +
      `<style>@page{margin:12mm}html,body{margin:0;padding:0}` +
      `.wrap{display:flex;justify-content:center;padding:8px}` +
      `svg{max-width:100%;height:auto}</style></head>` +
      `<body><div class="wrap">${source}</div></body></html>`,
  );
  w.document.close();
  w.focus();
  // Give the browser a tick to lay out the SVG before invoking print.
  const fire = () => w.print();
  w.onload = fire;
  setTimeout(fire, 350);
  return true;
}
