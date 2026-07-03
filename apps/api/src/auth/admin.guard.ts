import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '@archivato/shared';

/**
 * Route guard that allows only authenticated users with the `admin` role. Use it
 * after `JwtAuthGuard` (which populates `req.user`) on the superAdmin routes;
 * everyone else gets a 403 with no data leak.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}
