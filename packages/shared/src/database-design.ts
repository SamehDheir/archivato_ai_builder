/**
 * The Database Design — output of the Database Designer stage (spec Step 5).
 * Produced from a confirmed interview, its Requirement Document, and the
 * System Design. Includes entities, primary keys, foreign keys, and relations.
 */

import type { GenerationProvenance } from './generation';

/**
 * Common column types we suggest in the UI. Real models (and real databases)
 * emit many more (e.g. `varchar(255)`, `bigint`, `timestamp with time zone`),
 * so the column `type` is an open string — these are just the suggestions.
 */
export type CommonColumnType =
  | 'uuid'
  | 'string'
  | 'text'
  | 'integer'
  | 'decimal'
  | 'boolean'
  | 'timestamp'
  | 'date'
  | 'json'
  | 'enum';

/** A column's SQL type: a common suggestion OR any free-form string. */
// eslint-disable-next-line @typescript-eslint/ban-types
export type ColumnType = CommonColumnType | (string & {});

/** The common column types, for editor suggestions / dropdowns. */
export const COMMON_COLUMN_TYPES: CommonColumnType[] = [
  'uuid',
  'string',
  'text',
  'integer',
  'decimal',
  'boolean',
  'timestamp',
  'date',
  'json',
  'enum',
];

/** A foreign-key target. */
export interface ColumnReference {
  entity: string;
  column: string;
}

export interface EntityColumn {
  name: string;
  type: ColumnType;
  nullable: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  /** Present when this column is a foreign key. */
  references?: ColumnReference;
}

export interface Entity {
  /** Table name, e.g. "users". */
  name: string;
  description: string;
  columns: EntityColumn[];
}

export type RelationType = 'one-to-one' | 'one-to-many' | 'many-to-many';

export interface Relation {
  from: string;
  to: string;
  type: RelationType;
  description?: string;
}

export interface DatabaseDesign {
  sessionId: string;
  generatedAt: string;
  /** How this design was produced — see `generation.ts`. Absent = unknown. */
  generation?: GenerationProvenance;
  /** e.g. "PostgreSQL" (taken from the System Design). */
  databaseType: string;
  entities: Entity[];
  relations: Relation[];
}
