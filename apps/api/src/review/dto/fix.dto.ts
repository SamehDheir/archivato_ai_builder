import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsDefined,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PATCH_SECTION_KEYS, type PatchSectionKey } from '@archivato/shared';

/**
 * How many findings one batch may draft a fix for. A batch still needs ONE
 * explicit approval of ONE combined preview, so this bounds both the model call
 * and how much change a single click can carry — an owner cannot meaningfully
 * review twenty rewrites in one modal, and a cap is a cheaper guard than trusting
 * that they did.
 */
const MAX_BATCH = 5;

/** `POST /review/:sessionId/fix/propose` — draft a fix. Writes nothing. */
export class ProposeFixDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BATCH)
  @IsString({ each: true })
  findingIds!: string[];
}

/**
 * One section of a proposal coming back for approval. `proposedContent` is
 * deliberately only checked for *presence* here: its shape depends on which
 * section it targets, and `validateFixProposal` (shared, per-section, strict) is
 * the single place that knows those shapes. Splitting that check across a DTO and
 * a validator would let the two drift.
 */
export class PatchSectionDto {
  @IsIn(PATCH_SECTION_KEYS)
  key!: PatchSectionKey;

  @IsDefined()
  proposedContent!: unknown;

  @IsString()
  @MaxLength(2000)
  rationale!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  beforeSummary?: string;
}

/** `POST /review/:sessionId/fix/apply` — apply the proposal the owner approved. */
export class ApplyFixDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BATCH)
  @IsString({ each: true })
  findingIds!: string[];

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BATCH)
  @ValidateNested({ each: true })
  @Type(() => PatchSectionDto)
  sections!: PatchSectionDto[];
}

/** `POST /review/:sessionId/fix/client-question` — the owner's edited question. */
export class AddClientQuestionDto {
  @IsString()
  findingId!: string;

  @IsString()
  @MaxLength(500)
  question!: string;
}

/** `POST /review/:sessionId/fix/out-of-scope` — the owner's edited exclusion. */
export class AddOutOfScopeDto {
  @IsString()
  findingId!: string;

  @IsString()
  @MaxLength(300)
  item!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** `POST /review/:sessionId/fix/advisory` — acknowledge or dismiss with a note. */
export class ResolveAdvisoryDto {
  @IsString()
  findingId!: string;

  @IsIn(['acknowledged', 'dismissed'])
  action!: 'acknowledged' | 'dismissed';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
