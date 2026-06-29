import { IsString, MaxLength, MinLength } from 'class-validator';
import type { RefineRequest } from '@archivato/shared';

export class RefineDto implements RefineRequest {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  instruction!: string;
}
