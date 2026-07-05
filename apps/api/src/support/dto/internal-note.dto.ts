import { IsString, MaxLength, MinLength } from 'class-validator';

/** Body for POST /support/admin/tickets/:id/notes — private admin note. */
export class InternalNoteDto {
  @IsString()
  @MinLength(1, { message: 'The note cannot be empty.' })
  @MaxLength(5000)
  body!: string;
}
