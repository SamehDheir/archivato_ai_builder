import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@archivato/shared';

/** Metadata key holding the permissions a route requires. */
export const REQUIRED_PERMISSIONS = 'required_permissions';

/**
 * Require the caller to hold ALL listed permissions (RBAC). Apply after
 * `JwtAuthGuard` + `PermissionGuard`:
 *
 *   @UseGuards(JwtAuthGuard, PermissionGuard)
 *   @RequirePermissions('support:read_all')
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);
