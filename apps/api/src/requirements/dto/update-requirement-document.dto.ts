import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsString,
  ValidateNested,
} from 'class-validator';
import type {
  BusinessRule,
  FunctionalRequirement,
  NonFunctionalRequirement,
  RequirementPriority,
  UserRole,
} from '@archivato/shared';

const PRIORITIES: RequirementPriority[] = ['must', 'should', 'could'];

class FunctionalRequirementDto implements FunctionalRequirement {
  @IsString() id!: string;
  @IsString() title!: string;
  @IsString() description!: string;
  @IsIn(PRIORITIES) priority!: RequirementPriority;
}

class NonFunctionalRequirementDto implements NonFunctionalRequirement {
  @IsString() id!: string;
  @IsString() category!: string;
  @IsString() description!: string;
}

class UserRoleDto implements UserRole {
  @IsString() name!: string;
  @IsString() description!: string;
  @IsArray() @IsString({ each: true }) permissions!: string[];
}

class BusinessRuleDto implements BusinessRule {
  @IsString() id!: string;
  @IsString() description!: string;
}

/**
 * Body for PUT /requirements/:sessionId — the user-edited requirement document.
 * `sessionId`/`generatedAt` are NOT accepted from the client (whitelist strips
 * them); the service stamps both.
 */
export class UpdateRequirementDocumentDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FunctionalRequirementDto)
  functional!: FunctionalRequirementDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NonFunctionalRequirementDto)
  nonFunctional!: NonFunctionalRequirementDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserRoleDto)
  roles!: UserRoleDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BusinessRuleDto)
  businessRules!: BusinessRuleDto[];

  @IsArray() @IsString({ each: true }) constraints!: string[];
  @IsArray() @IsString({ each: true }) assumptions!: string[];
}
