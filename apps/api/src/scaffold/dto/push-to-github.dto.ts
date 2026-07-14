import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  COST_PROVIDER_IDS,
  SCAFFOLD_TARGETS,
  type CostProviderId,
  type ScaffoldTarget,
} from '@archivato/shared';

/**
 * Push-to-GitHub request. If `token` (a PAT) is supplied it is used once,
 * server-side, and never stored/logged. Otherwise the user's stored OAuth
 * connection is used (the "Connect with GitHub" flow).
 */
export class PushToGithubDto {
  /**
   * Optional GitHub PAT with `repo` scope (classic) or Contents+Administration
   * (fine-grained). Omit to use the stored OAuth connection.
   */
  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(255)
  token?: string;

  /** Target repository name (GitHub's allowed charset). */
  @IsString()
  @Matches(/^[A-Za-z0-9._-]+$/, {
    message: 'repoName may only contain letters, numbers, and . _ -',
  })
  @MaxLength(100)
  repoName!: string;

  /** Create the repo as private (default) or public. */
  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;

  /** What to push: the backend, the frontend, or both (default). */
  @IsOptional()
  @IsIn(SCAFFOLD_TARGETS as readonly string[])
  target?: ScaffoldTarget;

  /**
   * Provider the deployment artifacts target. Omit to use the one the Cost
   * Estimator recommends for this design.
   */
  @IsOptional()
  @IsIn(COST_PROVIDER_IDS as readonly string[])
  provider?: CostProviderId;
}
