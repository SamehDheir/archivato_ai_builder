import { IsEmail, IsString, MaxLength } from 'class-validator';
import type { LoginInput } from '@archivato/shared';

export class LoginDto implements LoginInput {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MaxLength(128)
  password!: string;
}
