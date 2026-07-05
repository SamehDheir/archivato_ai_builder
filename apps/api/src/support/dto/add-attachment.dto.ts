import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  SUPPORT_ATTACHMENT_MAX_BYTES,
  SUPPORT_ATTACHMENT_MIME_TYPES,
} from '@archivato/shared';

/**
 * Body for POST /support/tickets/:id/attachments. Attachments are stored as
 * metadata; for text-based files the client sends the extracted text
 * (`textContent`) so the AI can analyze logs. No binary is uploaded/served —
 * the design choice for this project (see CLAUDE.md).
 */
export class AddAttachmentDto {
  @IsString()
  @MaxLength(255)
  filename!: string;

  @IsIn(SUPPORT_ATTACHMENT_MIME_TYPES as unknown as string[])
  mimeType!: string;

  @IsInt()
  @Min(0)
  @Max(SUPPORT_ATTACHMENT_MAX_BYTES)
  sizeBytes!: number;

  /** Extracted text for text-based files (logs/txt/json). Omit for binary. */
  @IsOptional()
  @IsString()
  @MaxLength(200000)
  textContent?: string;

  /** Optional: attach to a specific message (else the ticket itself). */
  @IsOptional()
  @IsString()
  messageId?: string;
}
