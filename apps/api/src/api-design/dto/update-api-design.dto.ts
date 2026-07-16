import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import {
  API_MODULE_SOURCES,
  type ApiEndpoint,
  type ApiModule,
  type ApiModuleSource,
  type ExcludedEntity,
  type HttpMethod,
  type SchemaField,
} from '@archivato/shared';

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

class SchemaFieldDto implements SchemaField {
  @IsString() name!: string;
  @IsString() type!: string;
  @IsBoolean() required!: boolean;
}

class ApiEndpointDto implements ApiEndpoint {
  @IsIn(HTTP_METHODS) method!: HttpMethod;
  @IsString() path!: string;
  @IsString() summary!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SchemaFieldDto)
  requestSchema!: SchemaFieldDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SchemaFieldDto)
  responseSchema!: SchemaFieldDto[];

  @IsArray() @IsInt({ each: true }) statusCodes!: number[];
}

class ApiModuleDto implements ApiModule {
  @IsString() name!: string;
  @IsString() basePath!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApiEndpointDto)
  endpoints!: ApiEndpointDto[];

  // Coverage accounting rides along on the edit. Declared here because the global
  // ValidationPipe runs with `whitelist: true` — an undeclared field is stripped
  // silently, which would empty a design's coverage on the first autosave.
  @IsOptional() @IsArray() @IsString({ each: true }) coveredEntities?: string[];

  @IsOptional() @IsIn(API_MODULE_SOURCES) source?: ApiModuleSource;
}

class ExcludedEntityDto implements ExcludedEntity {
  @IsString() entity!: string;
  @IsString() reason!: string;
}

/** Body for PUT /api-design/:sessionId — the user-edited API design. */
export class UpdateApiDesignDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApiModuleDto)
  modules!: ApiModuleDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExcludedEntityDto)
  excludedEntities?: ExcludedEntityDto[];
}
