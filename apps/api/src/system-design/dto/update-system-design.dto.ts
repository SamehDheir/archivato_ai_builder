import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import {
  BUILD_VS_BUY_CAPABILITIES,
  MODULE_COMPLEXITIES,
  type ArchitectureType,
  type BuildVsBuyCapability,
  type BuildVsBuyItem,
  type BuildVsBuyRecommendation,
  type ConstraintCompliance,
  type ModuleComplexity,
  type PhasedArchitecture,
  type ServiceModule,
  type TechChoice,
} from '@archivato/shared';

const ARCHITECTURES: ArchitectureType[] = [
  'monolith',
  'modular_monolith',
  'microservices',
];

const RECOMMENDATIONS: BuildVsBuyRecommendation[] = ['build', 'buy'];

class TechChoiceDto implements TechChoice {
  @IsString() layer!: string;
  @IsString() technology!: string;
  @IsString() rationale!: string;
}

class ServiceModuleDto implements ServiceModule {
  @IsString() name!: string;
  @IsString() responsibility!: string;
  @IsArray() @IsString({ each: true }) dependencies!: string[];
  @IsOptional() @IsIn(MODULE_COMPLEXITIES) complexity?: ModuleComplexity;
  @IsOptional() @IsString() complexityRationale?: string;
}

class BuildVsBuyItemDto implements BuildVsBuyItem {
  // A closed set — an unknown capability name is a 400, never a silent pass.
  @IsIn(BUILD_VS_BUY_CAPABILITIES) capability!: BuildVsBuyCapability;
  @IsIn(RECOMMENDATIONS) recommendation!: BuildVsBuyRecommendation;
  @IsOptional() @IsString() suggestedService?: string;
  @IsString() rationale!: string;
  @IsString() impact!: string;
}

class PhasedArchitectureDto implements PhasedArchitecture {
  @IsString() mvp!: string;
  @IsString() growthPath!: string;
  @IsString() migrationNotes!: string;
}

class ConstraintComplianceDto implements ConstraintCompliance {
  @IsString() constraint!: string;
  @IsString() howAddressed!: string;
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

  // The R8 analysis fields are not in the structured editor; when omitted the
  // service carries them over from the stored design. Validated here so a client
  // that DOES send them can't smuggle in an unknown capability or bad shape.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BuildVsBuyItemDto)
  buildVsBuy?: BuildVsBuyItemDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => PhasedArchitectureDto)
  phasedArchitecture?: PhasedArchitectureDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConstraintComplianceDto)
  constraintCompliance?: ConstraintComplianceDto[];
}
