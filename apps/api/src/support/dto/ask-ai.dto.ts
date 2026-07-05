import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { SupportAskAiInput } from '@archivato/shared';

/** Body for POST /support/ai/deflect — pre-ticket AI deflection. */
export class AskAiDto implements SupportAskAiInput {
  @IsString()
  @MinLength(5, { message: 'Describe the problem in at least 5 characters.' })
  @MaxLength(4000)
  message!: string;

  @IsOptional()
  @IsUUID()
  sessionId?: string;
}
