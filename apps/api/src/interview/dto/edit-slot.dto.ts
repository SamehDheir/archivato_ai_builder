import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Correct a slot value at the confirmation gate. `slotKey` is validated against
 * the catalog in the service (it 400s an unknown key), so the DTO only enforces
 * shape — a non-empty string key and a non-empty value.
 */
export class EditSlotDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  slotKey!: string;

  @IsString()
  @IsNotEmpty({ message: 'A slot value cannot be empty.' })
  @MaxLength(2000)
  value!: string;
}
