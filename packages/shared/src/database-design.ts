/**
 * The Database Design — output of the Database Designer stage (spec Step 5).
 * Produced from a confirmed interview, its Requirement Document, and the
 * System Design. Includes entities, primary keys, foreign keys, and relations.
 */

import type { LocalizedArtifact } from './artifact-language';
import type { GenerationProvenance } from './generation';
import { dedupeBy } from './collections';

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

export interface DatabaseDesign extends LocalizedArtifact {
  sessionId: string;
  generatedAt: string;
  /** How this design was produced — see `generation.ts`. Absent = unknown. */
  generation?: GenerationProvenance;
  /** e.g. "PostgreSQL" (taken from the System Design). */
  databaseType: string;
  entities: Entity[];
  relations: Relation[];
  /**
   * Cross-tenant corrections made after generation, in the artifact's language —
   * a table the requirements call shared that was given a mandatory tenant
   * ownership key anyway, and what was done about it. See
   * `database-design.shared-entities.ts`.
   *
   * **OWNER-ONLY**, like `SystemDesign.uncoveredRequirements`: it is an internal
   * quality signal for the person still editing the schema, and stripped from the
   * share payload. Optional and additive (the JSON-blob convention) — a design
   * generated before this existed simply renders no notice.
   */
  sharedEntityNotices?: string[];
}

/**
 * Coerce a database design to a complete shape.
 *
 * Applied at **both** boundaries an untrusted design enters through — the agent's
 * LLM output (write) and the JSON store's read — because the store hands back
 * `row.data as unknown as DatabaseDesign`, and **that cast is a claim, not a
 * check**: a row written before a rule existed still violates the type it is cast
 * to, and only the read side can heal it.
 *
 * This is not hypothetical. The agent's `isValid` gates on `entities` and never
 * looked at `relations`, so a model reply that simply omitted the key was
 * accepted and stored — and `DatabaseDesignView` then died on
 * `design.relations.length`. `buildSqlDdl`, the ERD builder and the scaffold all
 * trust the same field, so the crash site was the first of four, not the bug.
 * **A missing array must read as empty, never as undefined.**
 */
export function normalizeDatabaseDesign(design: DatabaseDesign): DatabaseDesign {
  return {
    ...design,
    databaseType:
      typeof design?.databaseType === 'string' && design.databaseType.trim()
        ? design.databaseType
        : 'PostgreSQL',
    // Dedupe by name: a generated schema can repeat a table (an LLM listing it
    // twice, a re-merged chunk), and with nothing removing it the ERD and the
    // view render the entity — and its whole column block — over again. Columns
    // are deduped within each entity for the same reason.
    entities: dedupeBy(
      Array.isArray(design?.entities)
        ? design.entities
            .filter((e): e is Entity => !!e && typeof e.name === 'string')
            .map((e) => ({
              ...e,
              description: typeof e.description === 'string' ? e.description : '',
              columns: dedupeBy(
                Array.isArray(e.columns)
                  ? e.columns.filter(
                      (c): c is EntityColumn => !!c && typeof c.name === 'string',
                    )
                  : [],
                (c) => c.name,
              ),
            }))
        : [],
      (e) => e.name,
    ),
    // The field that crashed. A relation naming an endpoint that isn't a string
    // is dropped rather than rendered as "undefined → undefined"; identical
    // edges are folded so the diagram draws each once.
    relations: dedupeBy(
      Array.isArray(design?.relations)
        ? design.relations.filter(
            (r): r is Relation =>
              !!r && typeof r.from === 'string' && typeof r.to === 'string',
          )
        : [],
      (r) => `${r.from}|${r.to}|${r.type}`,
    ),
  };
}
