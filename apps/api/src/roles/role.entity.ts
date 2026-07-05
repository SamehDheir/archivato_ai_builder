import type { Permission } from '@archivato/shared';

/** A role record (dynamic, DB-managed). `permissions` are validated catalog keys. */
export interface Role {
  id: string;
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Fields accepted when creating a role (id/timestamps assigned by the store). */
export interface CreateRoleInput {
  key: string;
  name: string;
  description?: string;
  permissions?: Permission[];
  isSystem?: boolean;
}

/** Editable fields of a role (the key of a system role can't change). */
export interface UpdateRoleInput {
  name?: string;
  description?: string;
  permissions?: Permission[];
}
