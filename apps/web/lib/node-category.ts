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
    border: 'border-amber-400/60',
    text: 'text-amber-500',
    hex: '#f59e0b',
    label: 'Auth',
  },
  billing: {
    border: 'border-emerald-400/60',
    text: 'text-emerald-500',
    hex: '#10b981',
    label: 'Billing',
  },
  notify: {
    border: 'border-sky-400/60',
    text: 'text-sky-500',
    hex: '#0ea5e9',
    label: 'Notify',
  },
  users: {
    border: 'border-violet-400/60',
    text: 'text-violet-500',
    hex: '#8b5cf6',
    label: 'Users',
  },
  reporting: {
    border: 'border-cyan-400/60',
    text: 'text-cyan-500',
    hex: '#06b6d4',
    label: 'Reporting',
  },
  default: {
    border: 'border-primary/50',
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
