import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { ProjectIdeaInput, ProjectScale } from '@archivato/shared';

const SCALES: ProjectScale[] = ['mvp', 'startup', 'enterprise'];

/**
 * Starting a client scoping. Note `clientName` is NOT part of `ProjectIdeaInput`:
 * the controller splits it off before handing the idea to the pipeline, so the
 * client's name never lands in `session.input` — which is what the agents read
 * and what the public share page echoes back.
 */
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

  /** Who this scoping is for. Owner-facing label; optional. */
  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'Keep the client name under 120 characters.' })
  clientName?: string;

  /**
   * Notes-first mode: pasted call notes / meeting transcript. They become the
   * first transcript entry, then the normal interview loop runs (the first
   * adaptive turn extracts many slots at once). Generous cap — a real meeting
   * transcript is long — but bounded so a request body stays sane.
   */
  @IsOptional()
  @IsString()
  @MaxLength(20000, { message: 'Keep the notes under 20,000 characters.' })
  notes?: string;
}
