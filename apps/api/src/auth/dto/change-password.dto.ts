import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { ChangePasswordInput } from '@archivato/shared';

export class ChangePasswordDto implements ChangePasswordInput {
  // Optional at the DTO level: OAuth-only accounts SET a first password with no
  // current one. The service still requires it when a password already exists.
  @IsOptional()
  @IsString()
  @MaxLength(128)
  currentPassword?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
