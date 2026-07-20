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

import type { DatabaseDesign, Entity, EntityColumn } from './database-design';
import type { RequirementDocument } from './requirements';
import type { SystemDesign } from './system-design';

/** Table names that ARE the tenant table. */
const TENANT_TABLE = /^(?:tenants?|organizations?|orgs?|accounts?|workspaces?|companies|branches|clinics|stores|merchants|vendors)$/i;

/** Column names that scope a row to a tenant. */
const TENANT_COLUMN = /^(?:tenant|organization|org|workspace|company|branch|store|merchant|vendor)_id$/i;

/**
 * Language that indicates the platform serves MANY businesses, not one.
 *
 * Every entry names a relationship between the platform and multiple
 * *customers of the platform* — not merely a plural noun. "Multiple products"
 * is not tenancy; "multiple clinics" is.
 */
const MULTI_ORG_SIGNAL =
  /\b(?:multi[- ]?tenan\w*|multi[- ]?branch|multi[- ]?store|multi[- ]?org\w*|multi[- ]?compan\w*|multi[- ]?vendor|multi[- ]?merchant|multiple (?:tenants?|organi[sz]ations?|branches|clinics|stores|companies|businesses|vendors|merchants|locations|outlets|practices)|each (?:tenant|organi[sz]ation|branch|clinic|store|company)|per[- ](?:tenant|organi[sz]ation|branch)|tenant isolation|white[- ]?label|franchise|chain of|saas platform for|b2b saas)\b/i;

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
  const haystack = [
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

  return MULTI_ORG_SIGNAL.test(haystack);
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
