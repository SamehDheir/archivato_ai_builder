import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  ALL_PERMISSIONS,
  type Permission,
  type UpdateRoleInput,
} from '@archivato/shared';

/** Body for PATCH /admin/roles/:id — edit a role's name/description/permissions. */
export class UpdateRoleDto implements UpdateRoleInput {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsIn(ALL_PERMISSIONS as unknown as string[], { each: true })
  permissions?: Permission[];
}
