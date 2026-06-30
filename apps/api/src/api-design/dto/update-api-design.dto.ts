import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  ValidateNested,
} from 'class-validator';
import type {
  ApiEndpoint,
  ApiModule,
  HttpMethod,
  SchemaField,
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
}

/** Body for PUT /api-design/:sessionId — the user-edited API design. */
export class UpdateApiDesignDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApiModuleDto)
  modules!: ApiModuleDto[];
}
