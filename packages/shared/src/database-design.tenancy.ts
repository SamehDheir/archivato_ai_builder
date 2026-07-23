/**
 * Multi-tenancy, only when the requirements actually describe it.
 *
 * The Database Designer's prompt carries a deliberately forceful rule — *"when
 * the system serves several organizations, branches or tenants, EVERY table
 * carries the tenant foreign key"* — because a tenant column on `users` alone is
 * not isolation, and that omission is the single most damaging flaw a
 * multi-tenant schema can ship with. The rule is correct and stays.
 *
 * What it lacked was a floor. A rule that emphatic, with no stated negative
 * case, reads to a model as "tenancy is the professional default", so a
 * single-store fashion e-commerce project came back with a `tenants` table and a
 * `tenant_id` FK on every one of its tables. That is not a harmless extra: it is
 * a join on every query, a scoping concern in every endpoint, and a chunk of the
 * generated scaffold — real, unrequested build cost, quoted to a client who
 * described one shop and a tight budget.
 *
 * So this is the code half of the codebase's standing division of labour — the
 * prompt is the primary defence, deterministic code is the backstop — the same
 * shape as `enforcePaymentAvailability` and `missingAuthService`.
 *
 * The design is deliberately **asymmetric**, because the two errors are not
 * equally bad. Stripping tenancy from a genuinely multi-tenant schema would
 * create the cross-tenant data leak the prompt rule exists to prevent. Leaving
 * it on a single-tenant schema costs money. So the evidence bar is low: **any**
 * plausible multi-org signal in the requirements is enough to keep tenancy, and
 * only a design with no signal at all is stripped.
 */

import type { ArtifactLanguage } from './artifact-language';
import type {
  DatabaseDesign,
  Entity,
  EntityColumn,
  Relation,
} from './database-design';
import {
  findSharedEntityDeclarations,
  isSharedEntity,
  reconcileSharedEntities,
  TENANT_SCOPE_COLUMN,
  TENANT_SCOPE_TABLE,
  type SharedEntityDeclaration,
} from './database-design.shared-entities';
import type { RequirementDocument } from './requirements';
import type { SystemDesign } from './system-design';

/**
 * Table names that ARE the tenant table.
 *
 * Lives in `database-design.shared-entities.ts` and is imported here (one-way —
 * the reverse would be a runtime cycle), so the two halves of the tenancy rule
 * cannot disagree about what a tenant boundary looks like.
 */
const TENANT_TABLE = TENANT_SCOPE_TABLE;

/**
 * Column names that scope a row to a tenant, for the STRIP path.
 *
 * Kept deliberately narrow — only nouns that are almost never a plain domain FK.
 * `enforceTenancy` strips an unreferenced column purely on this name match, so a
 * word that could legitimately be domain data (a delivery `location_id`, a
 * `site_id`) must NOT be here: stripping it from a single-business schema would
 * delete real data. Detection of *existing* tenancy uses the broader set below.
 */
const TENANT_COLUMN = /^(?:tenant|organization|org|workspace|company|branch|store|merchant|vendor)_id$/i;

/**
 * Column names that indicate a row is ALREADY tenant-scoped, for the ADD path.
 *
 * Broader than `TENANT_COLUMN` because being wrong here is safe: it only stops
 * `ensureTenancy` from adding a *second* scoping column, never strips anything.
 * Shared with the cross-tenant module for the same no-drift reason as
 * `TENANT_TABLE` above.
 */
const SCOPING_COLUMN_BROAD = TENANT_SCOPE_COLUMN;

/**
 * Language that indicates the platform serves MANY businesses, not one.
 *
 * Every entry names a relationship between the platform and multiple
 * *customers of the platform* — not merely a plural noun. "Multiple products"
 * is not tenancy; "multiple clinics" is. The set was widened after a real
 * enterprise HealthTech run slipped through: a `TenantService` ("Provisions new
 * tenants, enforces data-residency…"), a **must** FR ("Tenant provisioning:
 * create new clinic or hospital branches and configure tenant settings"), and a
 * "Branch Manager" role ("administrator for a single clinic or hospital branch")
 * — none of which the original regex matched, so the schema shipped single-tenant
 * in direct contradiction of the requirements and system design.
 *
 * The new alternatives stay disciplined about the plural-noun trap the tests pin:
 * a bare "multiple products/orders/customers" is still not tenancy. What is added
 * is provisioning/settings/isolation language, a role scoped to *a single* org
 * unit (which only exists when there are several), data-residency, and the
 * org-boundary manager titles.
 */
const MULTI_ORG_SIGNAL =
  /\b(?:multi[- ]?tenan\w*|multi[- ]?branch|multi[- ]?store|multi[- ]?org\w*|multi[- ]?compan\w*|multi[- ]?vendor|multi[- ]?merchant|multiple (?:tenants?|organi[sz]ations?|branches|clinics|hospitals|stores|companies|businesses|vendors|merchants|locations|outlets|practices|schools|campuses|warehouses|sites)|each (?:tenant|organi[sz]ation|branch|clinic|store|company|location|school|warehouse|site)|per[- ](?:tenant|organi[sz]ation|branch|clinic|store|location|school|warehouse|region)|(?:single|one|their own|their assigned|a specific|the assigned) (?:tenant|organi[sz]ation|branch|clinic|hospital|store|location|site|school|warehouse|outlet|practice|campus)|tenant (?:provision\w*|onboard\w*|settings?|isolation|management|scoping|switching)|(?:provision|onboard|register|create)\w* (?:new )?(?:tenants?|branches|clinics|organi[sz]ations?|stores|schools|warehouses)|data[- ]residency|tenant isolation|white[- ]?label|franchis\w*|chain of|saas platform for|b2b saas)\b/i;

/**
 * Does this project actually serve multiple organizations?
 *
 * Reads the requirement document and the system design — the artifacts that
 * record what the *client* said — rather than the schema, which is the thing
 * under suspicion. A role literally named for an org boundary ("Branch
 * Manager", "Clinic Admin") counts as a signal on its own: nobody defines that
 * role for a single-location business.
 */
export function requiresMultiTenancy(
  requirements: RequirementDocument,
  systemDesign?: SystemDesign | null,
): boolean {
  return MULTI_ORG_SIGNAL.test(tenancyHaystack(requirements, systemDesign));
}

/** What `enforceTenancy` did, so the caller can report it. */
export interface TenancyEnforcement {
  design: DatabaseDesign;
  /** Set when tenancy was removed, describing what and why. */
  removed: string | null;
}

/**
 * Strip tenancy from a schema whose requirements never asked for it.
 *
 * Removes the tenant table itself, every `*_id` column pointing at it, and any
 * relation touching it. Two safeguards keep this from mangling a real schema:
 *
 *  1. **A tenant-named table that owns real domain data is kept.** `stores` in a
 *     multi-store retail schema is the tenant; `stores` holding a physical
 *     address and opening hours for the one shop is a legitimate domain entity.
 *     The test is whether other tables point at it *as a scope* — a table
 *     referenced by nearly everything is a tenant, one referenced by a few
 *     things is a domain record.
 *  2. **A column is only dropped when it is a scoping FK**, matched by name AND
 *     by resolving to the table being removed. A `branch_id` that references a
 *     surviving `branches` table is left alone.
 */
export function enforceTenancy(
  design: DatabaseDesign,
  requirements: RequirementDocument,
  systemDesign?: SystemDesign | null,
): TenancyEnforcement {
  if (requiresMultiTenancy(requirements, systemDesign)) {
    return { design, removed: null };
  }

  const tenantTables = design.entities
    .filter((e) => TENANT_TABLE.test(e.name.trim()))
    .filter((e) => isScopeTable(e, design))
    .map((e) => e.name.trim().toLowerCase());

  if (tenantTables.length === 0) return { design, removed: null };

  const isTenantTable = (name: string) =>
    tenantTables.includes(name.trim().toLowerCase());

  const entities = design.entities
    .filter((e) => !isTenantTable(e.name))
    .map((e) => ({
      ...e,
      columns: e.columns.filter((c) => !isTenantScopeColumn(c, isTenantTable)),
    }));

  return {
    design: {
      ...design,
      entities,
      relations: design.relations.filter(
        (r) => !isTenantTable(r.from) && !isTenantTable(r.to),
      ),
    },
    removed:
      `Removed ${tenantTables.map((t) => `"${t}"`).join(', ')} and the tenant ` +
      `foreign keys scoping to it: the requirements describe a single business, ` +
      `not a platform serving several organizations. Multi-tenancy adds a join to ` +
      `every query and scoping to every endpoint, so it is modelled only when asked for.`,
  };
}

/**
 * Is this table acting as a tenant scope rather than as a domain record?
 *
 * A tenant is what (almost) everything else hangs off. Requiring a **majority**
 * of the other tables to reference it is what separates "the org boundary" from
 * "a table that happens to be called stores" — and it fails safe: a schema where
 * the evidence is ambiguous keeps the table.
 */
function isScopeTable(entity: Entity, design: DatabaseDesign): boolean {
  const name = entity.name.trim().toLowerCase();
  const others = design.entities.filter(
    (e) => e.name.trim().toLowerCase() !== name,
  );
  if (others.length === 0) return false;

  const referencing = others.filter((e) =>
    e.columns.some(
      (c) =>
        TENANT_COLUMN.test(c.name) ||
        c.references?.entity.trim().toLowerCase() === name,
    ),
  ).length;

  return referencing > others.length / 2;
}

/** A column that exists only to scope its row to a tenant being removed. */
function isTenantScopeColumn(
  column: EntityColumn,
  isTenantTable: (name: string) => boolean,
): boolean {
  if (column.references) return isTenantTable(column.references.entity);
  return TENANT_COLUMN.test(column.name);
}

// ── positive direction: ensure tenancy the requirements DO ask for ───────────

/**
 * The tenant table + scoping-column names to use for a project, derived from the
 * vocabulary the requirements/design actually use.
 *
 * A HealthTech platform's tenant is a "branch"; a logistics one's is a
 * "warehouse"; a school platform's is a "school". Naming the synthesized table
 * after the domain's own word makes the backstop's output read like the rest of
 * the schema rather than a bolted-on generic `tenants`. Falls back to `tenants` /
 * `tenant_id` when no specific noun is present.
 */
const TENANT_NOUNS: { pattern: RegExp; table: string; column: string }[] = [
  { pattern: /\bbranch(?:es)?\b/i, table: 'branches', column: 'branch_id' },
  { pattern: /\bwarehouse(?:s)?\b/i, table: 'warehouses', column: 'warehouse_id' },
  { pattern: /\bschool(?:s)?\b/i, table: 'schools', column: 'school_id' },
  { pattern: /\bcampus(?:es)?\b/i, table: 'campuses', column: 'campus_id' },
  { pattern: /\bclinic(?:s)?\b/i, table: 'clinics', column: 'clinic_id' },
  { pattern: /\bstore(?:s)?\b/i, table: 'stores', column: 'store_id' },
  { pattern: /\boutlet(?:s)?\b/i, table: 'outlets', column: 'outlet_id' },
  { pattern: /\bfranchise(?:s)?\b/i, table: 'franchises', column: 'franchise_id' },
  { pattern: /\bworkspace(?:s)?\b/i, table: 'workspaces', column: 'workspace_id' },
  { pattern: /\borgani[sz]ation(?:s)?\b/i, table: 'organizations', column: 'organization_id' },
];

export function tenantEntityFor(
  requirements: RequirementDocument,
  systemDesign?: SystemDesign | null,
): { table: string; column: string } {
  const haystack = tenancyHaystack(requirements, systemDesign);
  for (const noun of TENANT_NOUNS) {
    if (noun.pattern.test(haystack)) return { table: noun.table, column: noun.column };
  }
  return { table: 'tenants', column: 'tenant_id' };
}

/** The requirement + design text tenancy signals are read from. */
function tenancyHaystack(
  requirements: RequirementDocument,
  systemDesign?: SystemDesign | null,
): string {
  return [
    requirements.executiveSummary ?? '',
    ...requirements.functional.flatMap((f) => [f.title, f.description]),
    ...requirements.nonFunctional.map((n) => n.description),
    ...(requirements.businessRules ?? []).map((b) => b.description),
    ...(requirements.constraints ?? []),
    ...requirements.roles.flatMap((r) => [r.name, r.description ?? '']),
    systemDesign?.architectureRationale ?? '',
    ...(systemDesign?.services ?? []).flatMap((s) => [s.name, s.responsibility]),
  ]
    .filter(Boolean)
    .join(' \n ');
}

/** Does this table already carry tenant scoping (so we must not double-add)? */
function alreadyScoped(entity: Entity): boolean {
  return entity.columns.some(
    (c) =>
      SCOPING_COLUMN_BROAD.test(c.name) ||
      (!!c.references && TENANT_TABLE.test(c.references.entity.trim())),
  );
}

/** A pure join table (≥2 FKs, no domain columns of its own) — scoped via parents. */
function isPureJunction(entity: Entity): boolean {
  const fks = entity.columns.filter((c) => c.references);
  if (fks.length < 2) return false;
  const domain = entity.columns.filter(
    (c) =>
      !c.references &&
      !c.primaryKey &&
      !/^(?:id|created_at|updated_at)$/i.test(c.name),
  );
  return domain.length === 0;
}

/** What `ensureTenancy` did, so the caller can report it. */
export interface TenancyAddition {
  design: DatabaseDesign;
  /** Set when tenancy was added, describing what and why. */
  added: string | null;
}

/**
 * Add the tenant scoping the requirements ask for but the schema left out.
 *
 * This is the counterpart to `enforceTenancy`, and the more important half: a
 * schema that DROPS required tenancy ships a cross-tenant data leak — every
 * record queryable across organizations — which is the single most damaging flaw
 * a multi-tenant system can have. A real enterprise run produced exactly that: a
 * `TenantService` and a tenant-provisioning requirement, but a schema with no
 * tenant table and no `*_id` scoping anywhere.
 *
 * Deliberately fires ONLY on the clear-cut total-miss case — the schema has no
 * scope table AND no scoping column at all. When the model modelled *some*
 * tenancy, it is trusted (completeness across every table is the prompt's job,
 * and second-guessing partial work risks mangling a correct schema). A tenant
 * FK is then added to every entity except the tenant table itself and pure join
 * tables (which are scoped through their parents). Over-scoping a would-be global
 * lookup table is the safe direction — the prompt rule is "EVERY table holding
 * their data", and an extra join costs money where a missing one costs a leak.
 *
 * **One exception, and it is not a name list.** A table the requirements
 * explicitly describe as shared across the whole organization — a patient seen at
 * several clinics, a member using any gym — is skipped, because forcing a
 * mandatory owner onto it fragments into N records the one thing the client said
 * must stay unified. That exception fires only on an explicit written statement
 * (`findSharedEntityDeclarations`), never on the table's name, so silence leaves
 * every table scoped exactly as before. See `database-design.shared-entities.ts`.
 */
export function ensureTenancy(
  design: DatabaseDesign,
  requirements: RequirementDocument,
  systemDesign?: SystemDesign | null,
  declarations?: readonly SharedEntityDeclaration[],
): TenancyAddition {
  if (!requiresMultiTenancy(requirements, systemDesign)) {
    return { design, added: null };
  }
  const shared = declarations ?? findSharedEntityDeclarations(requirements);

  const hasScopeTable = design.entities.some(
    (e) => TENANT_TABLE.test(e.name.trim()) && isScopeTable(e, design),
  );
  const hasScopingColumn = design.entities.some(alreadyScoped);
  if (hasScopeTable || hasScopingColumn) return { design, added: null };

  const { table, column } = tenantEntityFor(requirements, systemDesign);
  const singular = column.replace(/_id$/, '');

  const tenantTable: Entity = {
    name: table,
    description: `The ${table} (tenants) the platform serves; every tenant-scoped record links here.`,
    columns: [
      { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
      { name: 'name', type: 'string', nullable: false },
      { name: 'status', type: 'enum', nullable: false },
      { name: 'created_at', type: 'timestamp', nullable: false },
      { name: 'updated_at', type: 'timestamp', nullable: false },
    ],
  };

  const scopeColumn = (): EntityColumn => ({
    name: column,
    type: 'uuid',
    nullable: false,
    references: { entity: table, column: 'id' },
  });

  const scoped: string[] = [];
  const skippedAsShared: string[] = [];
  const entities = design.entities.map((entity) => {
    if (isPureJunction(entity) || entity.columns.some((c) => c.name === column)) {
      return entity;
    }
    // The requirements say this record belongs to the whole organization. Adding
    // the ownership key here is precisely the bug this exception exists for — and
    // it recurred across regenerations because this backstop put the key back
    // even on the runs where the model correctly left it off.
    if (isSharedEntity(entity.name, shared)) {
      skippedAsShared.push(entity.name);
      return entity;
    }
    scoped.push(entity.name);
    const columns = [...entity.columns];
    const pkIndex = columns.findIndex((c) => c.primaryKey);
    columns.splice(pkIndex >= 0 ? pkIndex + 1 : 0, 0, scopeColumn());
    return { ...entity, columns };
  });

  const relations: Relation[] = [
    ...design.relations,
    ...scoped.map((name) => ({
      from: table,
      to: name,
      type: 'one-to-many' as const,
      description: `Each ${singular} owns many ${name}.`,
    })),
  ];

  return {
    design: { ...design, entities: [tenantTable, ...entities], relations },
    added:
      `Added a "${table}" tenant table and a ${column} foreign key on ${scoped.length} table(s). ` +
      `The requirements and system design describe a multi-tenant platform, but the ` +
      `generated schema had no tenant scoping — which would leave every record queryable ` +
      `across tenants, the most damaging flaw a multi-tenant schema can ship with.` +
      (skippedAsShared.length > 0
        ? ` Left unscoped by design: ${skippedAsShared.join(', ')} — the requirements ` +
          `describe these records as shared across the whole organization.`
        : ''),
  };
}

/**
 * Reconcile a schema's tenancy with what the requirements actually describe —
 * add it when required and missing, strip it when present and unrequested.
 *
 * One entry point so a caller can't apply only half of the (asymmetric) rule.
 * The two directions never both fire: `ensureTenancy` no-ops unless multi-tenancy
 * is required, `enforceTenancy` no-ops when it is.
 */
export interface TenancyReconciliation {
  design: DatabaseDesign;
  added: string | null;
  removed: string | null;
  /**
   * Owner-facing sentences describing every cross-tenant correction made, in the
   * artifact's language. Empty when the requirements declared nothing shared,
   * which is the overwhelmingly common case.
   */
  sharedEntityNotices: string[];
}

export function applyTenancy(
  design: DatabaseDesign,
  requirements: RequirementDocument,
  systemDesign?: SystemDesign | null,
  language?: ArtifactLanguage,
): TenancyReconciliation {
  if (!requiresMultiTenancy(requirements, systemDesign)) {
    // Single-business: there is no tenancy, so there is nothing a record could be
    // shared *across*. `enforceTenancy` strips whatever scoping the model
    // invented, which subsumes the shared-record case entirely.
    const { design: next, removed } = enforceTenancy(design, requirements, systemDesign);
    return { design: next, added: null, removed, sharedEntityNotices: [] };
  }

  // Computed once and threaded into both halves, so the rule that decides which
  // tables are exempt from being GIVEN a tenant key is literally the same rule
  // that decides which are corrected afterwards.
  const declarations = findSharedEntityDeclarations(requirements);
  const { design: scoped, added } = ensureTenancy(
    design,
    requirements,
    systemDesign,
    declarations,
  );

  // The validation pass. It runs even when `ensureTenancy` was a no-op, because
  // the far more common case is a model that DID emit tenancy and got one table
  // wrong — which is invisible to a backstop that only fires on a total miss.
  const { design: reconciled, notices } = reconcileSharedEntities(
    scoped,
    declarations,
    tenantEntityFor(requirements, systemDesign),
    language,
  );

  return { design: reconciled, added, removed: null, sharedEntityNotices: notices };
}
