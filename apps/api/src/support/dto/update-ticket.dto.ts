import { IsIn, IsOptional, IsString } from 'class-validator';
import {
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
  type SupportCategory,
  type SupportPriority,
  type SupportTicketStatus,
} from '@archivato/shared';

/**
 * Body for PATCH /support/admin/tickets/:id — admins change status, priority,
 * category, or (re)assign. All fields optional; only provided ones are applied,
 * each recorded as its own timeline event.
 */
export class UpdateTicketDto {
  @IsOptional()
  @IsIn(SUPPORT_STATUSES as unknown as string[])
  status?: SupportTicketStatus;

  @IsOptional()
  @IsIn(SUPPORT_PRIORITIES as unknown as string[])
  priority?: SupportPriority;

  @IsOptional()
  @IsIn(SUPPORT_CATEGORIES as unknown as string[])
  category?: SupportCategory;

  /** Admin user id to assign, or empty string / null to unassign. */
  @IsOptional()
  @IsString()
  assigneeId?: string | null;
}
