import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { hasAllPermissions, type AuthUser, type Permission } from '@archivato/shared';
import { REQUIRED_PERMISSIONS } from './require-permissions.decorator';

/**
 * Route guard for RBAC. Reads the `@RequirePermissions(...)` metadata and 403s
 * unless the current user (populated by `JwtAuthGuard`) holds ALL of them. Use
 * after `JwtAuthGuard`. With no metadata it's a no-op (allows), so it's safe to
 * apply broadly.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      REQUIRED_PERMISSIONS,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (!req.user) throw new UnauthorizedException();
    if (!hasAllPermissions(req.user.permissions, required)) {
      throw new ForbiddenException('You do not have permission to do that.');
    }
    return true;
  }
}
