import { IsString, MaxLength, MinLength } from 'class-validator';
import type { SupportReplyInput } from '@archivato/shared';

/** Body for POST /support/tickets/:id/reply (customer or admin). */
export class ReplyDto implements SupportReplyInput {
  @IsString()
  @MinLength(1, { message: 'The reply cannot be empty.' })
  @MaxLength(10000)
  body!: string;
}
