import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import type { WaitlistSignupInput } from '@archivato/shared';

/** Body for the public `POST /waitlist` signup. */
export class JoinWaitlistDto implements WaitlistSignupInput {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  locale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  source?: string;
}
