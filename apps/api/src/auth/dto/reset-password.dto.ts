import { IsEmail, Length, Matches, MaxLength, MinLength } from 'class-validator';
import type { ResetPasswordInput } from '@archivato/shared';

export class ResetPasswordDto implements ResetPasswordInput {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  /** 6-digit numeric OTP from the email. */
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' })
  code!: string;

  @MinLength(8)
  @MaxLength(200)
  newPassword!: string;
}
