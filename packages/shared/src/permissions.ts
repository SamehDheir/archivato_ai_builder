/**
 * RBAC — the **static permission catalog** plus the seed (system) role
 * definitions. Runtime-free, so both the NestJS API (guards/services) and the
 * Next.js client (conditional UI) share one source of truth.
 *
 * Design (see CLAUDE.md): the *catalog* of permissions is code-defined — a
 * permission only means something because a guard checks it, so admins cannot
 * invent new ones. What IS dynamic (DB-managed, editable at runtime) is which
 * permissions each **role** grants and which **roles** a user holds. A user's
 * effective permissions are the UNION of their roles' permissions.
 */

/** A single capability the code enforces. Add here + gate a route to introduce one. */
export type Permission =
  // Support Center (staff working tickets)
  | 'support:read_all'
  | 'support:reply'
  | 'support:assign'
  | 'support:manage'
  | 'support:note'
  | 'support:copilot'
  // Platform administration
  | 'admin:analytics'
  | 'admin:users:read'
  | 'admin:users:manage'
  | 'admin:roles:manage'
  // Billing administration
  | 'billing:manage';

export type PermissionDomain = 'support' | 'admin' | 'billing';

export interface PermissionMeta {
  key: Permission;
  domain: PermissionDomain;
  /** Short human label for the role-editor grid. */
  label: string;
  description: string;
}

/** The full catalog (drives the role-editor UI + validation). */
export const PERMISSION_CATALOG: readonly PermissionMeta[] = [
  {
    key: 'support:read_all',
    domain: 'support',
    label: 'View all tickets',
    description: 'Read every customer support ticket across the system.',
  },
  {
    key: 'support:reply',
    domain: 'support',
    label: 'Reply to tickets',
    description: 'Post replies to any support ticket as staff.',
  },
  {
    key: 'support:assign',
    domain: 'support',
    label: 'Assign tickets',
    description: 'Assign or reassign tickets to support staff.',
  },
  {
    key: 'support:manage',
    domain: 'support',
    label: 'Manage tickets',
    description: 'Change ticket status, priority, and category.',
  },
  {
    key: 'support:note',
    domain: 'support',
    label: 'Internal notes',
    description: 'Add private internal notes to tickets.',
  },
  {
    key: 'support:copilot',
    domain: 'support',
    label: 'AI copilot',
    description: 'Use the admin AI copilot on tickets.',
  },
  {
    key: 'admin:analytics',
    domain: 'admin',
    label: 'View analytics',
    description: 'Access the platform analytics dashboard (traffic, KPIs).',
  },
  {
    key: 'admin:users:read',
    domain: 'admin',
    label: 'View users',
    description: 'Browse the user directory.',
  },
  {
    key: 'admin:users:manage',
    domain: 'admin',
    label: 'Manage users',
    description: "Change users' roles and delete accounts.",
  },
  {
    key: 'admin:roles:manage',
    domain: 'admin',
    label: 'Manage roles',
    description: 'Create, edit, delete roles and assign them to users.',
  },
  {
    key: 'billing:manage',
    domain: 'billing',
    label: 'Manage billing',
    description: 'View and manage subscriptions and billing.',
  },
] as const;

/** Every permission key (super-admin grant + validation helper). */
export const ALL_PERMISSIONS: readonly Permission[] = PERMISSION_CATALOG.map(
  (p) => p.key,
);

const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);

/** Type guard: is this string a known permission? (Filters stale DB values.) */
export function isPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value);
}

export function hasPermission(
  permissions: readonly Permission[] | undefined,
  required: Permission,
): boolean {
  return !!permissions && permissions.includes(required);
}

export function hasAnyPermission(
  permissions: readonly Permission[] | undefined,
  required: readonly Permission[],
): boolean {
  return !!permissions && required.some((p) => permissions.includes(p));
}

export function hasAllPermissions(
  permissions: readonly Permission[] | undefined,
  required: readonly Permission[],
): boolean {
  return !!permissions && required.every((p) => permissions.includes(p));
}

/**
 * A user is **staff** if they hold any permission at all — a plain `user`
 * (and an anonymous session) holds none. Staff accounts are console-only:
 * they work their assigned area (support / billing / admin) and cannot create
 * projects. Drives both the API's project-creation block and the web's
 * role-aware dashboard.
 */
export function isStaffUser(permissions: readonly Permission[] | undefined): boolean {
  return !!permissions && permissions.length > 0;
}

/** Union of the (valid) permissions granted by a set of roles. */
export function resolvePermissions(
  roles: readonly { permissions: string[] }[],
): Permission[] {
  const set = new Set<Permission>();
  for (const role of roles) {
    for (const p of role.permissions) {
      if (isPermission(p)) set.add(p);
    }
  }
  return [...set];
}

// ── Seed (system) roles ──────────────────────────────────────────────────────

/** Stable keys of the seeded system roles (protected from deletion/key edits). */
export type SystemRoleKey =
  | 'user'
  | 'support_agent'
  | 'billing_admin'
  | 'super_admin';

export const SUPER_ADMIN_ROLE_KEY: SystemRoleKey = 'super_admin';

export interface SeedRole {
  key: SystemRoleKey;
  name: string;
  description: string;
  permissions: Permission[];
}

const SUPPORT_PERMISSIONS: Permission[] = [
  'support:read_all',
  'support:reply',
  'support:assign',
  'support:manage',
  'support:note',
  'support:copilot',
];

/**
 * Roles seeded on boot (`isSystem`). Super-admin always grants the full catalog
 * (so a new permission is covered without a re-seed of that role's list — the
 * seeder recomputes it). Admins can still create additional custom roles.
 */
export const SYSTEM_ROLES: readonly SeedRole[] = [
  {
    key: 'user',
    name: 'User',
    description: 'Default role. Acts only on their own projects and tickets.',
    permissions: [],
  },
  {
    key: 'support_agent',
    name: 'Support Agent',
    description:
      'Works the Support Center — all ticket actions and the AI copilot. No user or billing administration.',
    permissions: SUPPORT_PERMISSIONS,
  },
  {
    key: 'billing_admin',
    name: 'Billing Admin',
    description: 'Manages subscriptions and billing. No ticket or user access.',
    permissions: ['billing:manage'],
  },
  {
    key: 'super_admin',
    name: 'Super Admin',
    description: 'Full platform control — every permission.',
    permissions: [...ALL_PERMISSIONS],
  },
] as const;
