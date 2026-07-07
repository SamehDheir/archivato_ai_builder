import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { DecisionKind, DecisionRef } from '@archivato/shared';

const KINDS: DecisionKind[] = ['architecture', 'tech', 'service'];

/**
 * Body for POST /system-design/:sessionId/explain — points at one decision in
 * the design. `key` is the tech layer or service name (ignored for architecture).
 */
export class ExplainDecisionDto implements DecisionRef {
  @IsIn(KINDS) kind!: DecisionKind;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  key: string = '';
}
