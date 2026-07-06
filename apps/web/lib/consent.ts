/**
 * Cookie-consent state for analytics. Essential cookies (auth, locale, theme)
 * always run and are out of scope here; this governs ONLY the analytics beacon +
 * its anonymous visitor cookie, which are set exclusively after `accepted`.
 *
 * State lives in localStorage. A custom window event lets already-mounted
 * components (the pageview tracker) react the moment the choice is made, without
 * a reload.
 */
export type ConsentValue = 'accepted' | 'declined';

const STORAGE_KEY = 'archivato.cookieConsent';
const CHANGE_EVENT = 'archivato:consent-change';

/** The stored choice, or `null` if the visitor hasn't decided yet. */
export function getConsent(): ConsentValue | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'accepted' || v === 'declined' ? v : null;
  } catch {
    return null;
  }
}

/** Persist the choice and notify subscribers in this tab. */
export function setConsent(value: ConsentValue): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Ignore storage failures (private mode); the event still fires.
  }
  window.dispatchEvent(new CustomEvent<ConsentValue>(CHANGE_EVENT, { detail: value }));
}

/** True only when the visitor has explicitly accepted analytics. */
export function analyticsAllowed(): boolean {
  return getConsent() === 'accepted';
}

/** Subscribe to consent changes; returns an unsubscribe function. */
export function onConsentChange(cb: (value: ConsentValue) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (e: Event) => cb((e as CustomEvent<ConsentValue>).detail);
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}
