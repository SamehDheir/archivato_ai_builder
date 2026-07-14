import { IsIn, IsOptional } from 'class-validator';
import { SCAFFOLD_TARGETS, type ScaffoldTarget } from '@archivato/shared';

/**
 * `?target=` on the scaffold reads. Omitted → the service's default (fullstack).
 * An unknown value is a 400 rather than a silent fallback: a caller asking for
 * something we don't build should hear about it, not get a different artifact.
 */
export class ScaffoldQueryDto {
  @IsOptional()
  @IsIn(SCAFFOLD_TARGETS as readonly string[])
  target?: ScaffoldTarget;
}
