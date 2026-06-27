/**
 * The Database Design — output of the Database Designer stage (spec Step 5).
 * Produced from a confirmed interview, its Requirement Document, and the
 * System Design. Includes entities, primary keys, foreign keys, and relations.
 */

export type ColumnType =
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
  /** e.g. "PostgreSQL" (taken from the System Design). */
  databaseType: string;
  entities: Entity[];
  relations: Relation[];
}
