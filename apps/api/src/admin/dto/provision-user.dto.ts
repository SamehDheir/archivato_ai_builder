import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { ProvisionUserInput } from '@archivato/shared';

/** Body for POST /admin/roles/provision-user — create a staff account. */
export class ProvisionUserDto implements ProvisionUserInput {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  displayName!: string;

  // At least one role — a roleless account would just be a normal user, which
  // defeats the purpose of provisioning staff.
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roleIds!: string[];
}
