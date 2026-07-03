import type { DatabaseDesign, Entity, EntityColumn } from '@archivato/shared';

/**
 * Client-side generators that turn a Database Design artifact into a
 * ready-to-use **Prisma schema** or **SQL DDL**, entirely in the browser (so the
 * per-stage download stays free). Both are best-effort: the AI design may omit a
 * primary key or reference a non-unique column, so each file leads with a
 * "review before migrating" header.
 */

/** PascalCase an entity/table name for a Prisma model name. */
function pascal(name: string): string {
  const out = name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
  return out || 'Model';
}

/** Map the design's database type to a Prisma datasource provider. */
function prismaProvider(databaseType: string): string {
  const t = (databaseType || '').toLowerCase();
  if (t.includes('mysql') || t.includes('maria')) return 'mysql';
  if (t.includes('sqlite')) return 'sqlite';
  if (t.includes('sqlserver') || t.includes('mssql') || t.includes('sql server'))
    return 'sqlserver';
  if (t.includes('mongo')) return 'mongodb';
  if (t.includes('cockroach')) return 'cockroachdb';
  return 'postgresql';
}

/** Primary-key columns — flagged ones, else a column literally named "id". */
function pkColumns(entity: Entity): EntityColumn[] {
  const flagged = entity.columns.filter((c) => c.primaryKey);
  if (flagged.length) return flagged;
  const idCol = entity.columns.find((c) => c.name.toLowerCase() === 'id');
  return idCol ? [idCol] : [];
}

// ── Prisma ─────────────────────────────────────────────────────────────────

interface PrismaField {
  name: string;
  type: string;
  attrs: string[];
  comment?: string;
}

/** Map a column type to a Prisma scalar type + `@db.*` attributes. */
function prismaScalar(col: EntityColumn): {
  type: string;
  db: string[];
  comment?: string;
} {
  switch (col.type.toLowerCase()) {
    case 'uuid':
      return { type: 'String', db: ['@db.Uuid'] };
    case 'string':
      return { type: 'String', db: [] };
    case 'text':
      return { type: 'String', db: ['@db.Text'] };
    case 'integer':
    case 'int':
    case 'bigint':
    case 'serial':
      return { type: 'Int', db: [] };
    case 'decimal':
    case 'numeric':
    case 'float':
      return { type: 'Decimal', db: [] };
    case 'boolean':
    case 'bool':
      return { type: 'Boolean', db: [] };
    case 'timestamp':
    case 'datetime':
      return { type: 'DateTime', db: [] };
    case 'date':
      return { type: 'DateTime', db: ['@db.Date'] };
    case 'json':
    case 'jsonb':
      return { type: 'Json', db: [] };
    case 'enum':
      return { type: 'String', db: [], comment: 'enum values not captured — using String' };
    default:
      return { type: 'String', db: [], comment: `original type "${col.type}"` };
  }
}

export function databaseDesignToPrisma(design: DatabaseDesign): string {
  const provider = prismaProvider(design.databaseType);
  const pg = provider === 'postgresql';

  const modelName = new Map<string, string>();
  for (const e of design.entities) modelName.set(e.name, pascal(e.name));

  // Columns referenced as FK targets must be @id/@unique for Prisma to validate.
  const referencedTargets = new Set<string>();
  for (const e of design.entities)
    for (const c of e.columns)
      if (c.references)
        referencedTargets.add(`${c.references.entity}.${c.references.column}`);

  const fieldsByEntity = new Map<string, PrismaField[]>();
  for (const e of design.entities) fieldsByEntity.set(e.name, []);

  for (const e of design.entities) {
    const fields = fieldsByEntity.get(e.name)!;
    const pks = pkColumns(e);
    const singlePk = pks.length === 1 ? pks[0] : null;

    for (const c of e.columns) {
      const mapped = prismaScalar(c);
      const isPk = pks.includes(c);
      const optional = c.nullable && !isPk;
      const attrs: string[] = [];

      if (c === singlePk) {
        attrs.push('@id');
        if (c.type.toLowerCase() === 'uuid') attrs.push('@default(uuid())');
        else if (mapped.type === 'Int') attrs.push('@default(autoincrement())');
      } else if (
        c.unique ||
        referencedTargets.has(`${e.name}.${c.name}`)
      ) {
        attrs.push('@unique');
      }
      if (pg) attrs.push(...mapped.db);

      fields.push({
        name: c.name,
        type: mapped.type + (optional ? '?' : ''),
        attrs,
        comment: mapped.comment,
      });
    }

    // Relation fields from foreign keys, with a back-relation on the target.
    for (const c of e.columns) {
      if (!c.references) continue;
      const targetModel = modelName.get(c.references.entity);
      if (!targetModel) continue; // dangling ref — leave the scalar FK only
      const relName = `${e.name}_${c.name}`;
      let relField = c.name.replace(/_?id$/i, '') || c.references.entity.toLowerCase();
      if (e.columns.some((x) => x.name === relField)) relField += 'Ref';

      fields.push({
        name: relField,
        type: targetModel + (c.nullable ? '?' : ''),
        attrs: [
          `@relation("${relName}", fields: [${c.name}], references: [${c.references.column}])`,
        ],
      });

      const backFields = fieldsByEntity.get(c.references.entity);
      if (backFields) {
        backFields.push({
          name: e.name.replace(/[^A-Za-z0-9]+/g, '_'),
          type: `${modelName.get(e.name)}[]`,
          attrs: [`@relation("${relName}")`],
        });
      }
    }
  }

  const out: string[] = [];
  out.push('// Prisma schema generated by Archivato AI Builder.');
  out.push('// Best-effort — review relations & types before running `prisma migrate`.');
  out.push('');
  out.push('datasource db {');
  out.push(`  provider = "${provider}"`);
  out.push('  url      = env("DATABASE_URL")');
  out.push('}');
  out.push('');
  out.push('generator client {');
  out.push('  provider = "prisma-client-js"');
  out.push('}');
  out.push('');

  for (const e of design.entities) {
    const fields = fieldsByEntity.get(e.name)!;
    const pks = pkColumns(e);
    out.push(`model ${modelName.get(e.name)} {`);
    for (const f of fields) {
      const attrs = f.attrs.length ? ` ${f.attrs.join(' ')}` : '';
      const comment = f.comment ? ` // ${f.comment}` : '';
      out.push(`  ${f.name} ${f.type}${attrs}${comment}`);
    }
    if (pks.length > 1) {
      out.push(`  @@id([${pks.map((c) => c.name).join(', ')}])`);
    }
    if (!pks.length) {
      out.push('  // ⚠ no primary key detected — Prisma requires an @id field');
    }
    out.push(`  @@map("${e.name}")`);
    out.push('}');
    out.push('');
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

// ── SQL DDL ──────────────────────────────────────────────────────────────────

/** Map a column type to an SQL type (Postgres-leaning, broadly portable). */
function sqlType(col: EntityColumn): string {
  switch (col.type.toLowerCase()) {
    case 'uuid':
      return 'UUID';
    case 'string':
      return 'VARCHAR(255)';
    case 'text':
      return 'TEXT';
    case 'integer':
    case 'int':
      return 'INTEGER';
    case 'bigint':
      return 'BIGINT';
    case 'decimal':
    case 'numeric':
      return 'DECIMAL';
    case 'float':
      return 'REAL';
    case 'boolean':
    case 'bool':
      return 'BOOLEAN';
    case 'timestamp':
    case 'datetime':
      return 'TIMESTAMP';
    case 'date':
      return 'DATE';
    case 'json':
    case 'jsonb':
      return 'JSONB';
    case 'enum':
      return 'VARCHAR(255)';
    default:
      return col.type.toUpperCase();
  }
}

export function databaseDesignToSql(design: DatabaseDesign): string {
  const out: string[] = [];
  out.push('-- SQL DDL generated by Archivato AI Builder.');
  out.push(
    `-- Dialect: ${design.databaseType || 'PostgreSQL'} — review before running.`,
  );
  out.push('');

  for (const e of design.entities) {
    const lines: string[] = [];
    for (const c of e.columns) {
      let l = `  "${c.name}" ${sqlType(c)}`;
      if (!c.nullable) l += ' NOT NULL';
      if (c.unique) l += ' UNIQUE';
      lines.push(l);
    }
    const pks = pkColumns(e);
    if (pks.length) {
      lines.push(`  PRIMARY KEY (${pks.map((c) => `"${c.name}"`).join(', ')})`);
    }
    out.push(`CREATE TABLE "${e.name}" (`);
    out.push(lines.join(',\n'));
    out.push(');');
    out.push('');
  }

  // Foreign keys after every table exists, so order never matters.
  const fks: string[] = [];
  for (const e of design.entities) {
    for (const c of e.columns) {
      if (!c.references) continue;
      fks.push(
        `ALTER TABLE "${e.name}" ADD CONSTRAINT "fk_${e.name}_${c.name}" ` +
          `FOREIGN KEY ("${c.name}") REFERENCES "${c.references.entity}" ("${c.references.column}");`,
      );
    }
  }
  if (fks.length) {
    out.push('-- Foreign keys');
    out.push(...fks);
    out.push('');
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
