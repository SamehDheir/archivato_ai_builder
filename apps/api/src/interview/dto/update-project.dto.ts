import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Partial update of a project's owner-facing labels (`PATCH /interview/:id`).
 *
 * Both fields are optional and independent, which makes "omitted" and "sent
 * empty" mean different things — deliberately:
 *
 *   - **omitted** → leave the field exactly as it is (so renaming a project can't
 *     silently wipe the client name it was scoped for, and vice versa);
 *   - **empty string** → clear it (the title falls back to the idea; the client
 *     name simply disappears from the card).
 *
 * Neither touches `idea`: that stays the AI's untouched source of truth.
 */
export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'Keep the name under 120 characters.' })
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'Keep the client name under 120 characters.' })
  clientName?: string;

  /**
   * The owner's internal weekly rate for pricing (USD/person-week). Owner-only —
   * `null` clears it, a number sets it, omitted leaves it. Never shown to clients.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  weeklyRate?: number | null;

  /**
   * Whether this project generates the threat model + QA plan (R12). Set from the
   * toggle at the confirmation gate, or later by the "generate security & QA
   * artifacts" action — which is why activation needs no endpoint of its own.
   */
  @IsOptional()
  @IsBoolean()
  generateExtendedArtifacts?: boolean;
}
