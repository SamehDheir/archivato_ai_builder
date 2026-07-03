import { IsIn } from 'class-validator';
import type { AccountRole } from '@archivato/shared';

/** Body for PATCH /admin/users/:id/role — promote/demote a user. */
export class UpdateRoleDto {
  @IsIn(['user', 'admin'])
  role!: AccountRole;
}
