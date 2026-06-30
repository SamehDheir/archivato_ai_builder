import { Type } from 'class-transformer';
import { IsArray, IsIn, IsString, ValidateNested } from 'class-validator';
import type {
  ArchitectureType,
  ServiceModule,
  TechChoice,
} from '@archivato/shared';

const ARCHITECTURES: ArchitectureType[] = [
  'monolith',
  'modular_monolith',
  'microservices',
];

class TechChoiceDto implements TechChoice {
  @IsString() layer!: string;
  @IsString() technology!: string;
  @IsString() rationale!: string;
}

class ServiceModuleDto implements ServiceModule {
  @IsString() name!: string;
  @IsString() responsibility!: string;
  @IsArray() @IsString({ each: true }) dependencies!: string[];
}

/** Body for PUT /system-design/:sessionId — the user-edited system design. */
export class UpdateSystemDesignDto {
  @IsIn(ARCHITECTURES) architecture!: ArchitectureType;
  @IsString() architectureRationale!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TechChoiceDto)
  techStack!: TechChoiceDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceModuleDto)
  services!: ServiceModuleDto[];
}
