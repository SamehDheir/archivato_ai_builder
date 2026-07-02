import { IsString, MaxLength, MinLength } from 'class-validator';
import type { UpdateProfileInput } from '@archivato/shared';

export class UpdateProfileDto implements UpdateProfileInput {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName!: string;
}
