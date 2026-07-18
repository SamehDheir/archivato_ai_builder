/**
 * Client-side file downloads. The anchor **must be attached to the document**
 * before `click()` — Firefox ignores a programmatic click on a detached anchor,
 * so a detached copy of this silently downloads nothing there.
 */

/** Trigger a browser download for an in-memory Blob. */
export function saveBlob(filename: string, blob: Blob) {
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
 * File types that get a UTF-8 BOM.
 *
 * A `Blob` built from a JS string is always UTF-8, and the API sends
 * `charset=utf-8` — the bytes are correct. Windows doesn't care: Notepad, Word
 * and Excel guess the ANSI codepage for a BOM-less file, so an em-dash arrives
 * as `â€"` and a `·` as `Â·`. That lands on the artifacts an owner forwards to a
 * client, where a document full of mojibake reads as broken software.
 *
 * Strictly limited to formats a person opens: a BOM makes `JSON.parse` throw,
 * and `psql` will happily try to execute one.
 */
const BOM_TYPES = ['text/markdown', 'text/csv', 'text/plain'];

/** Trigger a browser download for a string payload. */
export function saveFile(filename: string, content: string, mime: string) {
  const needsBom = BOM_TYPES.some((t) => mime.startsWith(t));
  const body = needsBom && !content.startsWith('﻿') ? `﻿${content}` : content;
  saveBlob(filename, new Blob([body], { type: mime }));
}

/**
 * Escape one CSV cell.
 *
 * Beyond RFC-4180 quoting, this neutralizes **formula injection**: a cell whose
 * value starts with `=`, `+`, `-`, `@`, or a leading tab/CR is evaluated as a
 * formula by Excel / Sheets / LibreOffice. Waitlist `source` (and other stored
 * strings) come from public, unauthenticated input, so an attacker could plant
 * `=HYPERLINK(...)` and have it execute in an admin's spreadsheet. Prefixing a
 * single quote makes the spreadsheet treat the value as literal text.
 */
export function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Build a CSV document from a header row + data rows (cells auto-escaped). */
export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}
