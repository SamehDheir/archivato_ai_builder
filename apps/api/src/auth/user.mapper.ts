import {
  SUPER_ADMIN_ROLE_KEY,
  type AuthUser,
  type Permission,
} from '@archivato/shared';
import type { User } from './user.entity';

/** The user's resolved RBAC context (role keys + effective permissions). */
export interface AuthAccess {
  roles: string[];
  permissions: Permission[];
}

/**
 * Strip the password hash and map a user to the client-safe shape, enriched with
 * their RBAC roles + effective permissions. The legacy `role` field is derived
 * for back-compat: `admin` iff the user holds the super-admin role.
 */
export function toAuthUser(user: User, access: AuthAccess): AuthUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    emailVerified: user.emailVerified,
    role: access.roles.includes(SUPER_ADMIN_ROLE_KEY) ? 'admin' : 'user',
    roles: access.roles,
    permissions: access.permissions,
    providers: user.providers,
    createdAt: user.createdAt.toISOString(),
  };
}
