import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import type {
  ColumnReference,
  ColumnType,
  Entity,
  EntityColumn,
  Relation,
  RelationType,
} from '@archivato/shared';

const RELATION_TYPES: RelationType[] = [
  'one-to-one',
  'one-to-many',
  'many-to-many',
];

class ColumnReferenceDto implements ColumnReference {
  @IsString() entity!: string;
  @IsString() column!: string;
}

class EntityColumnDto implements EntityColumn {
  @IsString() name!: string;
  // Column types are open-ended (e.g. `varchar(255)`), not a fixed enum.
  @IsString() type!: ColumnType;
  @IsBoolean() nullable!: boolean;
  @IsOptional() @IsBoolean() primaryKey?: boolean;
  @IsOptional() @IsBoolean() unique?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => ColumnReferenceDto)
  references?: ColumnReferenceDto;
}

class EntityDto implements Entity {
  @IsString() name!: string;
  @IsString() description!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EntityColumnDto)
  columns!: EntityColumnDto[];
}

class RelationDto implements Relation {
  @IsString() from!: string;
  @IsString() to!: string;
  @IsIn(RELATION_TYPES) type!: RelationType;
  @IsOptional() @IsString() description?: string;
}

/** Body for PUT /database-design/:sessionId — the user-edited database design. */
export class UpdateDatabaseDesignDto {
  @IsString() databaseType!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EntityDto)
  entities!: EntityDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RelationDto)
  relations!: RelationDto[];
}
