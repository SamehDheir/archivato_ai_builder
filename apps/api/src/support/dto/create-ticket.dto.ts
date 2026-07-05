import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  type CreateSupportTicketInput,
  type SupportCategory,
  type SupportPriority,
} from '@archivato/shared';

/** Body for POST /support/tickets — open a new ticket. */
export class CreateTicketDto implements CreateSupportTicketInput {
  @IsString()
  @MinLength(3, { message: 'Give the ticket a short subject.' })
  @MaxLength(160)
  subject!: string;

  @IsString()
  @MinLength(10, { message: 'Describe the issue in at least 10 characters.' })
  @MaxLength(10000)
  description!: string;

  @IsIn(SUPPORT_CATEGORIES as unknown as string[])
  category!: SupportCategory;

  @IsOptional()
  @IsIn(SUPPORT_PRIORITIES as unknown as string[])
  priority?: SupportPriority;

  @IsOptional()
  @IsUUID()
  sessionId?: string;
}
