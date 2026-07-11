/**
 * A single branded, email-client-safe HTML layout for all outbound mail
 * (verification, password reset, support notifications). Table-based with inline
 * styles so it renders consistently across clients (incl. Outlook); every
 * caller-supplied string is HTML-escaped, so it's safe to pass user-controlled
 * text (e.g. a ticket subject). The plain-text alternative is built by callers.
 */

export interface EmailButton {
  label: string;
  url: string;
}

export interface EmailTemplate {
  /** Hidden inbox preview text (preheader). */
  previewText: string;
  /** Big title inside the card. */
  heading: string;
  /** Body paragraphs — plain text, each escaped and wrapped in <p>. */
  paragraphs: string[];
  /** Optional large monospace box (e.g. a one-time code). */
  code?: string;
  /** Optional call-to-action button (also shown as a raw link fallback). */
  button?: EmailButton;
  /** Small muted line under the content (e.g. an expiry note). */
  footnote?: string;
}

// Brand palette (mirrors the app's --primary etc., as static hex for email).
const BRAND = '#3d63dd';
const TEXT = '#171c26';
const MUTED = '#5f6673';
const BORDER = '#e3e6ee';
const PAGE_BG = '#f5f6fa';
const CARD_BG = '#ffffff';
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Render the full HTML document for a transactional email. */
export function renderEmailHtml(t: EmailTemplate): string {
  const paragraphs = t.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.6;color:${TEXT};">${escapeHtml(
          p,
        )}</p>`,
    )
    .join('');

  const codeBlock = t.code
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;">
        <tr><td align="center" style="padding:18px;background:${PAGE_BG};border:1px solid ${BORDER};border-radius:10px;">
          <span style="font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:30px;font-weight:700;letter-spacing:8px;color:${TEXT};">${escapeHtml(
            t.code,
          )}</span>
        </td></tr>
      </table>`
    : '';

  const button = t.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 2px;">
        <tr><td align="center" bgcolor="${BRAND}" style="border-radius:8px;">
          <a href="${safeHref(t.button.url)}" target="_blank" style="display:inline-block;padding:12px 30px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(
            t.button.label,
          )}</a>
        </td></tr>
      </table>
      <p style="margin:14px 0 0;font-family:${FONT};font-size:12px;line-height:1.5;color:${MUTED};word-break:break-all;">Or paste this link into your browser:<br><a href="${safeHref(
        t.button.url,
      )}" style="color:${BRAND};">${escapeHtml(t.button.url)}</a></p>`
    : '';

  const footnote = t.footnote
    ? `<p style="margin:22px 0 0;font-family:${FONT};font-size:13px;line-height:1.5;color:${MUTED};">${escapeHtml(
        t.footnote,
      )}</p>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(t.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(
    t.previewText,
  )}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;">
      <tr><td style="padding:2px 6px 20px;">
        <span style="font-family:${FONT};font-size:20px;font-weight:800;letter-spacing:-0.4px;color:${TEXT};">Archivato<span style="color:${BRAND};">.</span></span>
      </td></tr>
      <tr><td style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:14px;padding:32px;">
        <h1 style="margin:0 0 16px;font-family:${FONT};font-size:20px;line-height:1.3;font-weight:700;color:${TEXT};">${escapeHtml(
          t.heading,
        )}</h1>
        ${paragraphs}
        ${codeBlock}
        ${button}
        ${footnote}
      </td></tr>
      <tr><td style="padding:20px 6px;">
        <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.5;color:${MUTED};">Archivato — the AI Software Architecture Generator.<br>You received this email because this address was used on Archivato. If that wasn't you, you can safely ignore it.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/** Escape text for safe interpolation into HTML element content. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Make a URL safe to place in an `href`.
 *
 * HTML-escaping alone does NOT neutralize the scheme — `javascript:alert(1)`
 * survives it intact — so allow only http/https and drop anything else to a
 * harmless anchor. Today every caller passes a server-built link (verifyUrl, a
 * WEB_ORIGIN deep link), but this keeps the guarantee if a user-influenced link
 * ever reaches here.
 */
function safeHref(value: string): string {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? escapeHtml(trimmed) : '#';
}
