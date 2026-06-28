import {
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { RegisterInput } from '@archivato/shared';

export class RegisterDto implements RegisterInput {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName!: string;
}
