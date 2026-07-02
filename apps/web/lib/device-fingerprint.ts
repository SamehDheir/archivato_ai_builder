/**
 * Browser device fingerprint — enforces **one account per device** at
 * registration (anti-spam). We hash a set of stable, low-entropy browser
 * signals into a single opaque string that the server stores only as a hash.
 *
 * This is deliberately dependency-free and best-effort: it deters casual
 * multi-account spam, not a determined attacker (a fresh browser/profile or an
 * incognito canvas block will look like a new device). Swap in a library such
 * as FingerprintJS here if stronger identification is needed later.
 */

/** Collect stable signals and hash them to a hex fingerprint. */
export async function getDeviceFingerprint(): Promise<string> {
  const signals = [
    navigator.userAgent,
    navigator.language,
    Array.isArray(navigator.languages) ? navigator.languages.join(',') : '',
    // `platform` is deprecated but still widely populated and stable per device.
    (navigator as Navigator & { platform?: string }).platform ?? '',
    String((navigator as Navigator & { hardwareConcurrency?: number })
      .hardwareConcurrency ?? ''),
    String((navigator as Navigator & { deviceMemory?: number })
      .deviceMemory ?? ''),
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    String(new Date().getTimezoneOffset()),
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
    canvasSignal(),
  ];
  return sha256Hex(signals.join('|'));
}

/**
 * A canvas-render signature — GPU/driver/font rendering differs per device, so
 * this adds entropy. Wrapped in try/catch: some privacy modes block canvas
 * reads, in which case we contribute a constant (the other signals still hash).
 */
function canvasSignal(): string {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-canvas';
    ctx.textBaseline = 'top';
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('Archivato', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('device-id', 4, 17);
    return canvas.toDataURL();
  } catch {
    return 'canvas-blocked';
  }
}

/** SHA-256 → hex. Uses Web Crypto (available in all supported browsers over HTTPS/localhost). */
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
