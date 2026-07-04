import { IsString, MaxLength } from 'class-validator';

/** Sets a project's display name. An empty string clears it (falls back to the idea). */
export class RenameProjectDto {
  @IsString()
  @MaxLength(120, { message: 'Keep the name under 120 characters.' })
  title!: string;
}
