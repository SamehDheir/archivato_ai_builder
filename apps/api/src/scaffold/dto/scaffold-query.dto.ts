import { IsIn, IsOptional } from 'class-validator';
import {
  COST_PROVIDER_IDS,
  SCAFFOLD_TARGETS,
  type CostProviderId,
  type ScaffoldTarget,
} from '@archivato/shared';

/**
 * `?target=` / `?provider=` on the scaffold reads. Omitted → the service's
 * defaults (fullstack; the Cost Estimator's recommended provider). An unknown
 * value is a 400 rather than a silent fallback: a caller asking for something we
 * don't build should hear about it, not get a different artifact.
 */
export class ScaffoldQueryDto {
  @IsOptional()
  @IsIn(SCAFFOLD_TARGETS as readonly string[])
  target?: ScaffoldTarget;

  /** Provider the deployment artifacts target. Omit for the recommendation. */
  @IsOptional()
  @IsIn(COST_PROVIDER_IDS as readonly string[])
  provider?: CostProviderId;
}
