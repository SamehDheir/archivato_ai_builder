import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { WaitlistAdminPage } from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { WaitlistService } from './waitlist.service';
import { ListWaitlistDto } from './dto/list-waitlist.dto';

/**
 * Admin view of the marketing waitlist — a read-only, RBAC-gated list of signups.
 * Restricted to **Super Admin** via `admin:roles:manage` (the app's de-facto
 * super-admin gate, held only by super_admin among the system roles — same as
 * the Roles / staff-provisioning console).
 */
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermissions('admin:roles:manage')
@Controller('waitlist/admin')
export class WaitlistAdminController {
  constructor(private readonly waitlist: WaitlistService) {}

  /** Newest-first, filterable, paginated page of signups. */
  @Get()
  list(@Query() query: ListWaitlistDto): Promise<WaitlistAdminPage> {
    return this.waitlist.list(query.page ?? 1, query.pageSize ?? 25, query.q);
  }
}
