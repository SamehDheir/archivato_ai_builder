/**
 * Keyword-based colour categories for canvas nodes (services / entities), so an
 * Auth box reads differently from a Billing box at a glance. Pure + dependency
 * free; used by both the Architecture and Database canvases and their minimaps.
 *
 * This is the ONE place in the app that legitimately spends non-semantic hue:
 * telling two unordered categories apart IS the function here, which is exactly
 * what the `--data-*` tokens exist for. Everything else — chips, badges,
 * severities, section headers — uses a semantic token or a neutral. Don't read
 * this file as licence to add a decorative palette elsewhere.
 */

export type NodeCategory =
  | 'auth'
  | 'billing'
  | 'notify'
  | 'users'
  | 'reporting'
  | 'default';

export interface CategoryStyle {
  /** Tailwind border class for the node box. */
  border: string;
  /** Tailwind background tint for the node header (vibrant, theme-safe). */
  headerBg: string;
  /** Tailwind text class for the category chip. */
  text: string;
  /**
   * Colour for the React Flow MiniMap dot.
   *
   * The one deliberate raw-colour exception in the app, and it is forced:
   * MiniMap sets the swatch via the SVG `fill` **attribute**, and `var()` does
   * not resolve inside a presentation attribute — `fill="hsl(var(--data-1))"`
   * renders as nothing. So these are literals that MIRROR the `--data-*` tokens
   * in globals.css (light-theme values; the minimap is a 120px thumbnail, so the
   * theme mismatch in dark mode is invisible at that size).
   *
   * If you retune a `--data-*` token, retune its twin here. There is no way to
   * derive one from the other without reading computed styles at runtime, which
   * is not worth it for a thumbnail.
   */
  hex: string;
  /** Human label for the legend / chip. */
  label: string;
}

/** Classify a service/entity name into a colour category by keyword. */
export function categorize(name: string): NodeCategory {
  const n = name.toLowerCase();
  if (/auth|login|security|identity|token|session|permission/.test(n))
    return 'auth';
  if (/billing|payment|invoice|subscription|checkout|order|price/.test(n))
    return 'billing';
  if (/notif|email|message|mail|sms|inbox|alert/.test(n)) return 'notify';
  if (/user|account|profile|member|customer|role|tenant/.test(n))
    return 'users';
  if (/report|analytic|dashboard|metric|stat|audit|log/.test(n))
    return 'reporting';
  return 'default';
}

export const CATEGORY_STYLE: Record<NodeCategory, CategoryStyle> = {
  auth: {
    border: 'border-data-1/70',
    headerBg: 'bg-data-1/15',
    text: 'text-data-1',
    hex: '#6d3ba8',
    label: 'Auth',
  },
  billing: {
    border: 'border-data-2/70',
    headerBg: 'bg-data-2/15',
    text: 'text-data-2',
    hex: '#1e7a4d',
    label: 'Billing',
  },
  notify: {
    border: 'border-data-3/70',
    headerBg: 'bg-data-3/15',
    text: 'text-data-3',
    hex: '#1470b8',
    label: 'Notify',
  },
  users: {
    border: 'border-data-4/70',
    headerBg: 'bg-data-4/15',
    text: 'text-data-4',
    hex: '#c26212',
    label: 'Users',
  },
  reporting: {
    border: 'border-data-5/70',
    headerBg: 'bg-data-5/15',
    text: 'text-data-5',
    hex: '#b83a6f',
    label: 'Reporting',
  },
  // The catch-all. Uses the accent on purpose — an unclassified box is the
  // baseline, and the accent is what "nothing special about this one" looks like
  // in a teal-accented app.
  default: {
    border: 'border-primary/60',
    headerBg: 'bg-primary/10',
    text: 'text-primary',
    hex: '#10707f',
    label: 'Other',
  },
};

/** Convenience: the category style for a name. */
export function styleFor(name: string): CategoryStyle {
  return CATEGORY_STYLE[categorize(name)];
}

/** The legend entries in a stable order (skips the catch-all "Other"). */
export const CATEGORY_LEGEND: CategoryStyle[] = (
  ['auth', 'billing', 'notify', 'users', 'reporting'] as NodeCategory[]
).map((k) => CATEGORY_STYLE[k]);
