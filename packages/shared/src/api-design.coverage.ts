/**
 * Entity coverage accounting for the API Design.
 *
 * The stage's promise: **every entity in the database design either gets an
 * endpoint group or a declared reason it doesn't**. Nothing enforced that before
 * — the prompt mentioned entities in passing and no code ever checked the result
 * — so a model that grouped its modules around services quietly shipped tables
 * with no API at all, and the only signal was a user noticing a missing resource
 * weeks later.
 *
 * Pure and runtime-free: the API validates the LLM's output through these, the
 * web renders the summary from the same numbers, and the unit tests need no DB.
 */

import type { ApiDesign, ApiModule, ExcludedEntity } from './api-design';

/** The result of checking a design against the database entities. */
export interface EntityCoverage {
  /** Entity names reachable through at least one endpoint group. */
  covered: string[];
  /** Entity names deliberately left out, with a stated reason. */
  excluded: string[];
  /** Entity names with neither — the failure this whole module exists to catch. */
  missing: string[];
  /** True when nothing is missing. */
  ok: boolean;
}

/** Compare entity names and path segments on their letters and digits alone. */
function key(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function singular(value: string): string {
  return value.endsWith('s') ? value.slice(0, -1) : value;
}

/** Resolve a loose name/segment back to the exact entity name it refers to. */
function makeResolver(
  entityNames: readonly string[],
): (value: string) => string | null {
  const exact = new Map<string, string>();
  for (const name of entityNames) exact.set(key(name), name);

  // Singular/plural is the one slack we allow: `/api/user/:id` for a `users`
  // table is the same resource, and refusing to see that would have us generate
  // a duplicate one.
  const loose = new Map<string, string>();
  for (const name of entityNames) {
    const s = singular(key(name));
    if (!exact.has(s) && !loose.has(s)) loose.set(s, name);
  }

  return (value: string) => {
    const k = key(value);
    if (!k) return null;
    return exact.get(k) ?? loose.get(k) ?? null;
  };
}

/**
 * Entities a group is the **resource for**, according to its paths — the backstop
 * for a model that designed `/api/orders` correctly and just didn't fill in the
 * bookkeeping.
 *
 * This is why coverage isn't declaration-only. Treating an undeclared-but-real
 * resource as missing would send the repair pass off to build a second `Orders`
 * module next to the one already there, and duplicate resources are a worse
 * artifact than the paperwork gap they'd be fixing.
 *
 * Only the segments **before the first path param** count. Everything past one is
 * a sub-resource of the thing being addressed, not a resource this group owns:
 * reading `/api/customers/:id/orders` as "Customers covers orders" would let a
 * lone nested read route stand in for the orders API and suppress the repair that
 * should have built it. A group that genuinely serves an entity nested-only can
 * still say so — an explicit `coveredEntities` is always honoured.
 */
export function inferCoveredEntities(
  module: ApiModule,
  entityNames: readonly string[],
): string[] {
  return inferWith(module, makeResolver(entityNames));
}

function inferWith(
  module: ApiModule,
  resolve: (value: string) => string | null,
): string[] {
  const paths = [
    module.basePath ?? '',
    ...(module.endpoints ?? []).map((e) => e.path ?? ''),
  ];
  const found = new Set<string>();
  for (const path of paths) {
    for (const segment of path.split('/')) {
      // `api` is the global prefix; a param ends the group's own resource path.
      if (!segment || segment === 'api') continue;
      if (segment.startsWith(':') || segment.startsWith('{')) break;
      const name = resolve(segment);
      if (name) found.add(name);
    }
  }
  return [...found];
}

/**
 * Fill in each group's `coveredEntities` (declared ∪ inferred, restricted to
 * entities that actually exist) and drop any exclusion the design contradicts by
 * covering the entity anyway. Idempotent — call it any time the modules change.
 */
export function withResolvedCoverage(
  design: ApiDesign,
  entityNames: readonly string[],
): ApiDesign {
  const resolve = makeResolver(entityNames);
  const modules = (design.modules ?? []).map((module) => {
    const covered = new Set<string>();
    for (const claimed of module.coveredEntities ?? []) {
      // A model can claim coverage of something that isn't an entity; only real
      // names count, or the summary starts lying.
      const name = resolve(claimed);
      if (name) covered.add(name);
    }
    for (const name of inferWith(module, resolve)) covered.add(name);
    return { ...module, coveredEntities: [...covered] };
  });

  const isCovered = new Set(modules.flatMap((m) => m.coveredEntities ?? []));
  const excludedEntities = (design.excludedEntities ?? [])
    .map((e) => ({ ...e, entity: resolve(e.entity) ?? '' }))
    // An exclusion for a table the design doesn't have is noise the validator
    // already ignores — but the page renders this list verbatim, so leaving it
    // in shows the user a phantom row and an "excluded" count that disagrees
    // with the one the validator enforced.
    .filter((e) => e.entity && !isCovered.has(e.entity));

  const resolved: ApiDesign = { ...design, modules };
  if (excludedEntities.length > 0) resolved.excludedEntities = excludedEntities;
  else delete resolved.excludedEntities;
  return resolved;
}

/**
 * The validator: every entity must be covered by a group or declared excluded.
 *
 * Declaration-only by design — it reads what the artifact claims, nothing else.
 * Run `withResolvedCoverage` first if you want path inference folded in.
 *
 * It checks that an exclusion *exists and is justified*, not that the
 * justification is a good one. Code can't judge whether "junction table" is true;
 * the prompt narrows the acceptable reasons and this enforces that one was given.
 */
export function validateEntityCoverage(
  design: ApiDesign,
  entityNames: readonly string[],
): EntityCoverage {
  const resolve = makeResolver(entityNames);
  const covered = new Set<string>();
  for (const module of design.modules ?? []) {
    for (const claimed of module.coveredEntities ?? []) {
      const name = resolve(claimed);
      if (name) covered.add(name);
    }
  }

  const excluded = new Set<string>();
  for (const entry of design.excludedEntities ?? []) {
    if (!entry?.reason?.trim()) continue;
    const name = resolve(entry.entity ?? '');
    // Covered wins: an entity with both a group and an exclusion is served.
    if (name && !covered.has(name)) excluded.add(name);
  }

  const missing = entityNames.filter(
    (name) => !covered.has(name) && !excluded.has(name),
  );

  return {
    covered: entityNames.filter((n) => covered.has(n)),
    excluded: entityNames.filter((n) => excluded.has(n)),
    missing,
    ok: missing.length === 0,
  };
}

/** Groups + exclusions produced by a repair round-trip or the fallback builder. */
export interface CoverageAddition {
  modules?: ApiModule[];
  excludedEntities?: ExcludedEntity[];
}

/**
 * Merge repair/fallback output into a design, keeping **only what fills a gap**.
 *
 * The filter is the point. Asked for two missing entities, a model will happily
 * hand back a redesigned `Users` module too — appending that verbatim would give
 * the artifact two `Users` resources, and the export/scaffold builders downstream
 * have no way to tell which one is real.
 */
export function mergeMissingCoverage(
  design: ApiDesign,
  addition: CoverageAddition,
  missing: readonly string[],
): ApiDesign {
  const resolve = makeResolver(missing);
  const usedNames = new Set((design.modules ?? []).map((m) => m.name));

  const modules = [...(design.modules ?? [])];
  for (const module of addition.modules ?? []) {
    const fills = (module.coveredEntities ?? [])
      .map((e) => resolve(e))
      .filter((e): e is string => !!e);
    if (fills.length === 0) continue;

    // Module names key the view's list and tag the OpenAPI operations, so a
    // collision has to be broken here rather than downstream.
    let name = module.name;
    let n = 2;
    while (usedNames.has(name)) name = `${module.name} ${n++}`;
    usedNames.add(name);

    modules.push({ ...module, name, coveredEntities: [...new Set(fills)] });
  }

  const filled = new Set(modules.flatMap((m) => m.coveredEntities ?? []));
  const excludedEntities = [...(design.excludedEntities ?? [])];
  const declared = new Set(excludedEntities.map((e) => e.entity));
  for (const entry of addition.excludedEntities ?? []) {
    const name = resolve(entry?.entity ?? '');
    if (!name || !entry?.reason?.trim()) continue;
    if (filled.has(name) || declared.has(name)) continue;
    declared.add(name);
    excludedEntities.push({ entity: name, reason: entry.reason.trim() });
  }

  const merged: ApiDesign = { ...design, modules };
  if (excludedEntities.length > 0) merged.excludedEntities = excludedEntities;
  else delete merged.excludedEntities;
  return merged;
}
