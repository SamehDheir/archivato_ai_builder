import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { TrackEventInput } from '@archivato/shared';

/** Body for the public `POST /analytics/track` pageview beacon. */
export class TrackEventDto implements TrackEventInput {
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  path!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  referrer?: string;
}
