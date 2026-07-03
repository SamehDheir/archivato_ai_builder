/**
 * Keyword-based colour categories for canvas nodes (services / entities), so an
 * Auth box reads differently from a Billing box at a glance. Pure + dependency
 * free; used by both the Architecture and Database canvases and their minimaps.
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
  /** Hex colour for the React Flow MiniMap dot. */
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
    border: 'border-amber-500/70',
    headerBg: 'bg-amber-500/15',
    text: 'text-amber-600 dark:text-amber-400',
    hex: '#f59e0b',
    label: 'Auth',
  },
  billing: {
    border: 'border-emerald-500/70',
    headerBg: 'bg-emerald-500/15',
    text: 'text-emerald-600 dark:text-emerald-400',
    hex: '#10b981',
    label: 'Billing',
  },
  notify: {
    border: 'border-sky-500/70',
    headerBg: 'bg-sky-500/15',
    text: 'text-sky-600 dark:text-sky-400',
    hex: '#0ea5e9',
    label: 'Notify',
  },
  users: {
    border: 'border-violet-500/70',
    headerBg: 'bg-violet-500/15',
    text: 'text-violet-600 dark:text-violet-400',
    hex: '#8b5cf6',
    label: 'Users',
  },
  reporting: {
    border: 'border-cyan-500/70',
    headerBg: 'bg-cyan-500/15',
    text: 'text-cyan-600 dark:text-cyan-400',
    hex: '#06b6d4',
    label: 'Reporting',
  },
  default: {
    border: 'border-primary/60',
    headerBg: 'bg-primary/10',
    text: 'text-primary',
    hex: '#6d8bff',
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
