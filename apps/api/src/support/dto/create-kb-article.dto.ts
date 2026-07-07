import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  SUPPORT_CATEGORIES,
  type CreateKbArticleInput,
  type SupportCategory,
} from '@archivato/shared';

/** Body for POST /support/admin/kb — create a KB article. */
export class CreateKbArticleDto implements CreateKbArticleInput {
  @IsString()
  @MinLength(3, { message: 'Give the article a title.' })
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(10, { message: 'Write at least a short article body.' })
  @MaxLength(20000)
  body!: string;

  @IsIn(SUPPORT_CATEGORIES as unknown as string[])
  category!: SupportCategory;

  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  keywords!: string[];

  @IsBoolean()
  published!: boolean;
}

/** Body for PATCH /support/admin/kb/:id — partial update. */
export class UpdateKbArticleDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(20000)
  body?: string;

  @IsOptional()
  @IsIn(SUPPORT_CATEGORIES as unknown as string[])
  category?: SupportCategory;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  keywords?: string[];

  @IsOptional()
  @IsBoolean()
  published?: boolean;
}
