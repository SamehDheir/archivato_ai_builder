import { IsEmail, MaxLength } from 'class-validator';
import type { ForgotPasswordInput } from '@archivato/shared';

export class ForgotPasswordDto implements ForgotPasswordInput {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
