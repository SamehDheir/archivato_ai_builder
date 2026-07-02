import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '@archivato/shared';
import { BillingService } from './billing.service';

/**
 * Route guard that 402s unless the current user is on an active Pro plan. Use it
 * (after `JwtAuthGuard`) on the Pro-only generation routes — the API design and
 * everything downstream (review, roadmap, export). `BillingService.assertPro`
 * throws the 402 with an `upgrade_required` code the client turns into a prompt.
 */
@Injectable()
export class ProGuard implements CanActivate {
  constructor(private readonly billing: BillingService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    if (!req.user) throw new UnauthorizedException();
    await this.billing.assertPro(req.user.id); // throws 402 when not Pro
    return true;
  }
}
