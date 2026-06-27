import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { ProjectIdeaInput, ProjectScale } from '@archivato/shared';

const SCALES: ProjectScale[] = ['mvp', 'startup', 'enterprise'];

export class StartInterviewDto implements ProjectIdeaInput {
  @IsString()
  @MinLength(10, { message: 'Describe the idea in at least 10 characters.' })
  idea!: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsIn(SCALES)
  scale?: ProjectScale;

  @IsOptional()
  @IsString()
  preferredStack?: string;
}
