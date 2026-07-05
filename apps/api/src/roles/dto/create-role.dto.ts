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
  type CreateRoleInput,
  type Permission,
} from '@archivato/shared';

/** Body for POST /admin/roles — create a custom role. */
export class CreateRoleDto implements CreateRoleInput {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;

  @IsArray()
  @IsIn(ALL_PERMISSIONS as unknown as string[], { each: true })
  permissions!: Permission[];
}
