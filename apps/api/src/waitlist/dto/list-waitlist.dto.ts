import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Query for the admin waitlist list (`GET /waitlist/admin`). The global
 * ValidationPipe runs with `transform: true`, so `@Type(() => Number)` coerces
 * the raw query strings; `whitelist: true` strips anything unlisted.
 *
 * The service still clamps page/pageSize (defense in depth) — this DTO is what
 * keeps unvalidated free text (notably an unbounded `q` headed for a Prisma
 * `contains`) out of the service in the first place.
 */
export class ListWaitlistDto {
  /** Case-insensitive contains match on email/source. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
