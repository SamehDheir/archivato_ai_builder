import { IsOptional, IsString, MaxLength } from 'class-validator';

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
}
