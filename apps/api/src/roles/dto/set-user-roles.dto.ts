import { IsArray, IsString } from 'class-validator';
import type { SetUserRolesInput } from '@archivato/shared';

/** Body for PUT /admin/roles/user/:userId — replace a user's whole role set. */
export class SetUserRolesDto implements SetUserRolesInput {
  @IsArray()
  @IsString({ each: true })
  roleIds!: string[];
}
