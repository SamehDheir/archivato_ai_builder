/**
 * Deterministic **frontend scaffolding** — turns the confirmed design into a
 * runnable Next.js (App Router) + Tailwind client for the generated backend.
 * Pure and runtime-free, mirroring `buildBackendScaffold()`: no LLM, stable
 * across runs, unit-testable offline.
 *
 * Mapping:
 *   - API Design endpoints → a typed fetch client (`lib/api/<module>.ts`), one
 *     function per endpoint, named by the SAME `assignHandlers()` the backend
 *     uses — so the client's `create()` calls the controller's `create()`.
 *   - API Design modules   → a page per module: a list wired to the collection
 *     GET, a create form wired to the POST body schema, and a detail/edit page
 *     wired to GET/:id + PUT/:id.
 *
 * Correctness over richness — the same bar as the backend builder:
 *   - Item fields are all OPTIONAL. They're derived from the *designed* response
 *     schema, not from a running API, so a page must render safely when a field
 *     turns out to be absent. Lying with `required` here would be a crash.
 *   - List responses are unwrapped defensively (`Array.isArray(data) ? … : []`),
 *     because the design says "a list" without saying whether it's wrapped.
 *   - Any design text (module names, summaries, the idea) is embedded in JSX as
 *     a JSON-encoded string expression, never as raw JSX text — LLM output
 *     contains quotes and braces, which would otherwise not compile.
 *   - Only endpoints with a single `:id`-style segment get wired to pages; more
 *     exotic ones still get a typed client function, but no invented UI.
 */

import type { ApiEndpoint, ApiModule, SchemaField } from './api-design';
import {
  FRONTEND_DEV_PORT,
  type ScaffoldFile,
  type ScaffoldInput,
} from './scaffold';
import {
  assignHandlers,
  camel,
  comment,
  dedupe,
  fieldKind,
  httpMethod,
  kebab,
  oneLine,
  pascal,
  safePath,
  stripApi,
  uniquifyNames,
  words,
  type Handler,
} from './scaffold.util';

/** Columns beyond this turn the list table into an unreadable smear. */
const MAX_COLUMNS = 6;

/** A single `:param` segment — the only shape we wire to a dynamic route. */
const SINGLE_PARAM = /^:(\w+)$/;

/** One API module, resolved into everything the generators need. */
interface ModuleView {
  slug: string;
  cls: string;
  name: string;
  endpointCount: number;
  handlers: Handler[];
  /** Item type name + its (all-optional) fields. */
  itemType: string;
  fields: ItemField[];
  list: Handler | null;
  detail: Handler | null;
  create: Handler | null;
  update: Handler | null;
  remove: Handler | null;
}

interface ItemField {
  /** Identifier used in code, e.g. `authorId`. */
  key: string;
  /** Human label, e.g. `Author Id`. */
  label: string;
  ts: string;
}

/** A body/query field, resolved for both the type and the form input. */
interface FormField {
  key: string;
  label: string;
  ts: string;
  input: 'text' | 'number' | 'checkbox' | 'datetime-local';
  json: boolean;
  required: boolean;
}

/** Build the full frontend scaffold as a flat, sorted list of files. */
export function buildFrontendScaffold(input: ScaffoldInput): ScaffoldFile[] {
  const modules = uniquifyNames(input.apiDesign?.modules ?? [], (m) =>
    kebab(m.name),
  );
  const views = modules.map(toModuleView);

  const files: ScaffoldFile[] = [
    ...rootFiles(input, views),
    { path: 'app/layout.tsx', content: renderLayout(views) },
    { path: 'app/page.tsx', content: renderHome(input.idea, views) },
    { path: 'app/globals.css', content: GLOBALS_CSS },
    { path: 'lib/api-client.ts', content: API_CLIENT },
    { path: 'lib/format.ts', content: FORMAT },
  ];

  for (const m of views) {
    if (m.handlers.length > 0) {
      files.push({ path: `lib/api/${m.slug}.ts`, content: renderClient(m) });
    }
    files.push({ path: `app/${m.slug}/page.tsx`, content: renderListPage(m) });
    if (m.create) {
      files.push({
        path: `app/${m.slug}/new/page.tsx`,
        content: renderCreatePage(m, m.create),
      });
    }
    const routeParam = detailParam(m);
    if (routeParam) {
      files.push({
        path: `app/${m.slug}/[${routeParam}]/page.tsx`,
        content: renderDetailPage(m, routeParam),
      });
    }
  }

  // Stable order so output is deterministic (and diffs are clean).
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

// ── Resolving a module ───────────────────────────────────────────────────────

function toModuleView(mod: ApiModule): ModuleView {
  const handlers = assignHandlers(mod.endpoints ?? []);
  const cls = pascal(mod.name);

  // A collection route takes no path params at all; an item route takes exactly
  // one, in the last segment. Anything else (a nested or tenant-scoped path)
  // still gets a typed client function — it just doesn't get an invented page.
  const collection = (h: Handler) => !h.subPath && pathParams(h).length === 0;
  const item = (h: Handler) =>
    SINGLE_PARAM.test(h.subPath) && pathParams(h).length === 1;

  const list = handlers.find((h) => h.endpoint.method === 'GET' && collection(h)) ?? null;
  const detail =
    handlers.find((h) => h.endpoint.method === 'GET' && item(h)) ?? null;
  const create =
    handlers.find(
      (h) => h.endpoint.method === 'POST' && collection(h) && h.dtoName !== null,
    ) ?? null;
  const update =
    handlers.find(
      (h) =>
        (h.endpoint.method === 'PUT' || h.endpoint.method === 'PATCH') &&
        item(h) &&
        h.dtoName !== null,
    ) ?? null;
  const remove =
    handlers.find((h) => h.endpoint.method === 'DELETE' && item(h)) ?? null;

  return {
    slug: kebab(mod.name),
    cls,
    name: mod.name,
    endpointCount: (mod.endpoints ?? []).length,
    handlers,
    itemType: `${cls}Item`,
    fields: itemFields([detail, list, create]),
    list,
    detail,
    create,
    update,
    remove,
  };
}

/**
 * The item's shape, from the **richest** designed response among the candidates
 * (in preference order on a tie) — a detail endpoint often returns fewer fields
 * than the list it belongs to, and the table wants the wide one. Taking the
 * union instead would drag a paginated list's wrapper fields (`total`, `page`)
 * in as columns.
 *
 * Every field is optional (see the file header) and an `id` is always present so
 * the pages can offer per-row actions even when the design forgot to list it.
 */
function itemFields(candidates: (Handler | null)[]): ItemField[] {
  let schema: SchemaField[] = [];
  for (const h of candidates) {
    const next = h?.endpoint.responseSchema ?? [];
    if (next.length > schema.length) schema = next;
  }

  const fields: ItemField[] = [];
  const seen = new Set<string>();

  for (const f of schema) {
    const key = camel(f.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    fields.push({ key, label: label(f.name), ts: fieldKind(f.type).ts });
  }

  if (!seen.has('id')) {
    fields.unshift({ key: 'id', label: 'Id', ts: 'string | number' });
  }
  return fields;
}

function formFields(h: Handler): FormField[] {
  const seen = new Set<string>();
  const fields: FormField[] = [];
  for (const f of h.dtoFields) {
    const key = camel(f.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const kind = fieldKind(f.type);
    fields.push({
      key,
      label: label(f.name),
      ts: kind.ts,
      input: kind.input,
      json: kind.ts.startsWith('Record'),
      required: f.required,
    });
  }
  return fields;
}

/** The dynamic route segment for a module's detail/edit page, if it has one. */
function detailParam(m: ModuleView): string | null {
  const h = m.detail ?? m.update;
  const match = h ? SINGLE_PARAM.exec(h.subPath) : null;
  return match ? camel(match[1]) : null;
}

/**
 * Every `:param` in the endpoint's FULL path, in order — not just the ones after
 * the module base. A tenant-scoped path (`/api/:tenant/users/:id`) has a param
 * the module-relative `subPath` never sees, and a client function that
 * interpolated it without declaring it wouldn't compile.
 */
function pathParams(h: Handler): string[] {
  return [...stripApi(h.endpoint.path).matchAll(/:(\w+)/g)].map((m) => camel(m[1]));
}

// ── The typed client ─────────────────────────────────────────────────────────

function renderClient(m: ModuleView): string {
  const imports = new Set<string>(['apiFetch']);
  const types: string[] = [];
  const fns: string[] = [];

  types.push(
    [
      `/**`,
      ` * A ${m.name} record as the API returns it.`,
      ` *`,
      ` * Every field is optional on purpose: this is derived from the DESIGNED`,
      ` * response schema, not from a running API, so the pages render safely even`,
      ` * when a field is missing. Tighten it once the endpoints are implemented.`,
      ` */`,
      `export interface ${m.itemType} {`,
      ...m.fields.map((f) => `  ${f.key}?: ${f.ts};`),
      `}`,
    ].join('\n'),
  );

  for (const h of m.handlers) {
    const { endpoint } = h;
    const bodyType = `${pascal(h.name)}${m.cls}Body`;
    const queryType = `${pascal(h.name)}${m.cls}Query`;
    const args: string[] = [];

    const params = dedupe(pathParams(h));
    for (const p of params) {
      imports.add('param');
      args.push(`${p}: string | number`);
    }

    if (h.dtoName) {
      types.push(
        [
          `export interface ${bodyType} {`,
          ...formFields(h).map(
            (f) => `  ${f.key}${f.required ? '' : '?'}: ${f.ts};`,
          ),
          `}`,
        ].join('\n'),
      );
      args.push(`body: ${bodyType}`);
    }

    // A GET's request schema is its query string. Every filter is optional: the
    // design can't tell us which ones the server actually insists on.
    const query = endpoint.method === 'GET' ? queryFields(h) : [];
    if (query.length) {
      imports.add('qs');
      types.push(
        [
          `export interface ${queryType} {`,
          ...query.map((f) => `  ${f.key}?: ${f.ts};`),
          `}`,
        ].join('\n'),
      );
      args.push(`query?: ${queryType}`);
    }

    const returns = returnType(m, h);
    const path = clientPath(endpoint, params, query.length > 0);
    const method = httpMethod(endpoint.method);
    const init: string[] = [];
    if (method !== 'GET') init.push(`method: '${method}'`);
    if (h.dtoName) init.push('body: JSON.stringify(body)');
    const initArg = init.length ? `, { ${init.join(', ')} }` : '';

    fns.push(
      [
        // The sanitized path, not the designed one: the comment must describe the
        // request this function actually makes.
        `/** ${method} ${safePath(endpoint.path)} — ${comment(endpoint.summary)} */`,
        `export function ${h.name}(${args.join(', ')}): Promise<${returns}> {`,
        `  return apiFetch<${returns}>(${path}${initArg});`,
        `}`,
      ].join('\n'),
    );
  }

  return [
    `import { ${[...imports].sort().join(', ')} } from '../api-client';`,
    '',
    types.join('\n\n'),
    '',
    fns.join('\n\n'),
    '',
  ].join('\n');
}

function returnType(m: ModuleView, h: Handler): string {
  if (h === m.list) return `${m.itemType}[]`;
  if (h === m.detail || h === m.create || h === m.update) return m.itemType;
  if (h === m.remove) return 'void';
  return 'unknown';
}

/** A GET's query fields, deduped by identifier. */
function queryFields(h: Handler): ItemField[] {
  const seen = new Set<string>();
  const fields: ItemField[] = [];
  for (const f of h.endpoint.requestSchema ?? []) {
    const key = camel(f.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    fields.push({ key, label: label(f.name), ts: fieldKind(f.type).ts });
  }
  return fields;
}

/**
 * The request path, relative to `API_URL` (which already ends in `/api`), as a
 * JS expression: `'/users'`, or a template literal when it interpolates.
 */
function clientPath(
  endpoint: ApiEndpoint,
  params: string[],
  hasQuery: boolean,
): string {
  const path = '/' + stripApi(endpoint.path);
  const declared = new Set(params);
  const interpolated = path.replace(/:(\w+)/g, (raw, p: string) => {
    const key = camel(p);
    // Only interpolate what the signature declares — never emit a reference to
    // a variable that doesn't exist.
    return declared.has(key) ? `\${param(${key})}` : raw;
  });
  const suffix = hasQuery ? '${qs(query)}' : '';
  const needsTemplate = interpolated !== path || hasQuery;
  return needsTemplate ? `\`${interpolated}${suffix}\`` : `'${path}'`;
}

// ── Pages ────────────────────────────────────────────────────────────────────

function renderListPage(m: ModuleView): string {
  if (!m.list) return renderEndpointListPage(m);

  const imports = new Set<string>(['useCallback', 'useEffect', 'useState']);
  const clientImports = new Set<string>([m.list.name, `type ${m.itemType}`]);
  const linked = Boolean(m.create) || Boolean(detailParam(m));
  if (m.remove) clientImports.add(m.remove.name);

  const columns = m.fields.slice(0, MAX_COLUMNS);
  const canEdit = detailParam(m) !== null;

  const head = [
    `'use client';`,
    '',
    `import { ${[...imports].sort().join(', ')} } from 'react';`,
    ...(linked ? [`import Link from 'next/link';`] : []),
    `import { ${[...clientImports].sort().join(', ')} } from '@/lib/api/${m.slug}';`,
    ...(columns.length ? [`import { cell } from '@/lib/format';`] : []),
    '',
  ];

  const body = [
    `export default function ${m.cls}Page() {`,
    `  const [rows, setRows] = useState<${m.itemType}[]>([]);`,
    `  const [loading, setLoading] = useState(true);`,
    `  const [error, setError] = useState<string | null>(null);`,
    '',
    `  const load = useCallback(async () => {`,
    `    setLoading(true);`,
    `    setError(null);`,
    `    try {`,
    `      const data = await ${m.list.name}();`,
    `      // The design says this returns a list. If your API wraps it`,
    `      // ({ items: [...] }), unwrap it in lib/api/${m.slug}.ts.`,
    `      setRows(Array.isArray(data) ? data : []);`,
    `    } catch (e) {`,
    `      setError(e instanceof Error ? e.message : String(e));`,
    `    } finally {`,
    `      setLoading(false);`,
    `    }`,
    `  }, []);`,
    '',
    `  useEffect(() => {`,
    `    void load();`,
    `  }, [load]);`,
    '',
    ...(m.remove
      ? [
          `  async function onDelete(id: string | number) {`,
          `    if (!window.confirm('Delete this record?')) return;`,
          `    try {`,
          `      await ${m.remove.name}(id);`,
          `      await load();`,
          `    } catch (e) {`,
          `      setError(e instanceof Error ? e.message : String(e));`,
          `    }`,
          `  }`,
          '',
        ]
      : []),
    `  return (`,
    `    <section>`,
    `      <div className="flex items-center justify-between">`,
    `        <h1 className="text-xl font-semibold">{${str(m.name)}}</h1>`,
    ...(m.create
      ? [
          `        <Link`,
          `          href="/${m.slug}/new"`,
          `          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"`,
          `        >`,
          `          New`,
          `        </Link>`,
        ]
      : []),
    `      </div>`,
    '',
    ...ERROR_BLOCK,
    '',
    `      {loading ? (`,
    `        <p className="mt-6 text-sm text-slate-500">Loading…</p>`,
    `      ) : rows.length === 0 ? (`,
    `        <p className="mt-6 text-sm text-slate-500">No records yet.</p>`,
    `      ) : (`,
    ...(columns.length
      ? renderTable(m, columns, canEdit)
      : [
          `        <ul className="mt-6 space-y-3">`,
          `          {rows.map((row, i) => (`,
          `            <li key={i} className="rounded-md border border-slate-200 bg-white p-3">`,
          `              <pre className="overflow-x-auto text-xs">{JSON.stringify(row, null, 2)}</pre>`,
          `            </li>`,
          `          ))}`,
          `        </ul>`,
        ]),
    `      )}`,
    `    </section>`,
    `  );`,
    `}`,
    '',
  ];

  return [...head, ...body].join('\n');
}

function renderTable(m: ModuleView, columns: ItemField[], canEdit: boolean): string[] {
  const hasActions = canEdit || Boolean(m.remove);
  return [
    `        <table className="mt-6 w-full border-collapse text-left text-sm">`,
    `          <thead>`,
    `            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">`,
    ...columns.map(
      (c) => `              <th className="py-2 pe-4">{${str(c.label)}}</th>`,
    ),
    ...(hasActions ? [`              <th className="py-2" />`] : []),
    `            </tr>`,
    `          </thead>`,
    `          <tbody>`,
    `            {rows.map((row, i) => {`,
    `              const id = row.id;`,
    `              return (`,
    `                <tr key={id ?? i} className="border-b border-slate-100">`,
    ...columns.map(
      (c) =>
        `                  <td className="py-2 pe-4">{cell(row.${c.key})}</td>`,
    ),
    ...(hasActions
      ? [
          `                  <td className="py-2 text-end">`,
          `                    {id != null && (`,
          `                      <span className="flex justify-end gap-3">`,
          ...(canEdit
            ? [
                `                        <Link href={\`/${m.slug}/\${id}\`} className="text-slate-600 underline">`,
                `                          Open`,
                `                        </Link>`,
              ]
            : []),
          ...(m.remove
            ? [
                `                        <button`,
                `                          type="button"`,
                `                          onClick={() => onDelete(id)}`,
                `                          className="text-red-600 underline"`,
                `                        >`,
                `                          Delete`,
                `                        </button>`,
              ]
            : []),
          `                      </span>`,
          `                    )}`,
          `                  </td>`,
        ]
      : []),
    `                </tr>`,
    `              );`,
    `            })}`,
    `          </tbody>`,
    `        </table>`,
  ];
}

/** A module with no collection GET: show what it does have, honestly. */
function renderEndpointListPage(m: ModuleView): string {
  return [
    `export default function ${m.cls}Page() {`,
    `  return (`,
    `    <section>`,
    `      <h1 className="text-xl font-semibold">{${str(m.name)}}</h1>`,
    `      <p className="mt-2 text-sm text-slate-500">`,
    `        This module has no list endpoint in the design, so there is nothing to`,
    `        show here yet. Its endpoints are typed and ready to call from{' '}`,
    `        <code className="rounded bg-slate-100 px-1">lib/api/${m.slug}.ts</code>.`,
    `      </p>`,
    ...(m.handlers.length
      ? [
          `      <ul className="mt-6 space-y-2 text-sm">`,
          ...m.handlers.map((h) =>
            [
              `        <li className="rounded-md border border-slate-200 bg-white p-3">`,
              `          <code className="font-medium">{${str(
                `${httpMethod(h.endpoint.method)} ${safePath(h.endpoint.path)}`,
              )}}</code>`,
              `          <p className="mt-1 text-slate-500">{${str(oneLine(h.endpoint.summary))}}</p>`,
              `        </li>`,
            ].join('\n'),
          ),
          `      </ul>`,
        ]
      : []),
    `    </section>`,
    `  );`,
    `}`,
    '',
  ].join('\n');
}

function renderCreatePage(m: ModuleView, create: Handler): string {
  const fields = formFields(create);
  const bodyType = `${pascal(create.name)}${m.cls}Body`;

  return [
    `'use client';`,
    '',
    `import { useState } from 'react';`,
    `import { useRouter } from 'next/navigation';`,
    `import { ${create.name}, type ${bodyType} } from '@/lib/api/${m.slug}';`,
    '',
    `export default function New${m.cls}Page() {`,
    `  const router = useRouter();`,
    ...fields.map((f) => `  ${stateHook(f)}`),
    `  const [saving, setSaving] = useState(false);`,
    `  const [error, setError] = useState<string | null>(null);`,
    '',
    `  async function onSubmit(e: React.FormEvent) {`,
    `    e.preventDefault();`,
    `    setSaving(true);`,
    `    setError(null);`,
    `    try {`,
    ...jsonParseBlock(fields, '      '),
    `      const body: ${bodyType} = {`,
    ...fields.map((f) => `        ${bodyEntry(f)}`),
    `      };`,
    `      await ${create.name}(body);`,
    `      router.push('/${m.slug}');`,
    `    } catch (err) {`,
    `      setError(err instanceof Error ? err.message : String(err));`,
    `    } finally {`,
    `      setSaving(false);`,
    `    }`,
    `  }`,
    '',
    `  return (`,
    `    <section className="max-w-lg">`,
    `      <h1 className="text-xl font-semibold">{${str(`New ${m.name}`)}}</h1>`,
    '',
    ...ERROR_BLOCK,
    '',
    `      <form onSubmit={onSubmit} className="mt-6 space-y-4">`,
    ...fields.flatMap((f) => inputBlock(f)),
    `        <button`,
    `          type="submit"`,
    `          disabled={saving}`,
    `          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"`,
    `        >`,
    `          {saving ? 'Saving…' : 'Create'}`,
    `        </button>`,
    `      </form>`,
    `    </section>`,
    `  );`,
    `}`,
    '',
  ].join('\n');
}

/**
 * Detail + edit. Three shapes, depending on what the design actually offers:
 * fetch + edit form, fetch only (read-only), or edit form only (no prefill).
 */
function renderDetailPage(m: ModuleView, routeParam: string): string {
  const { detail, update } = m;
  const fields = update ? formFields(update) : [];
  const bodyType = update ? `${pascal(update.name)}${m.cls}Body` : null;
  // With no update endpoint the page is a read-only detail view — that's the only
  // branch that holds the fetched item in state; the edit form holds fields.
  const readOnly = Boolean(detail) && !update;

  const clientImports = new Set<string>();
  if (detail) clientImports.add(detail.name);
  if (readOnly) clientImports.add(`type ${m.itemType}`);
  if (update && bodyType) {
    clientImports.add(update.name);
    clientImports.add(`type ${bodyType}`);
  }

  const reactImports = new Set<string>(['useState']);
  if (detail) {
    reactImports.add('useCallback');
    reactImports.add('useEffect');
  }

  const lines: string[] = [
    `'use client';`,
    '',
    `import { ${[...reactImports].sort().join(', ')} } from 'react';`,
    ...(update ? [`import { useRouter } from 'next/navigation';`] : []),
    `import { ${[...clientImports].sort().join(', ')} } from '@/lib/api/${m.slug}';`,
    ...(detail && !update ? [`import { cell } from '@/lib/format';`] : []),
    '',
    `export default function ${m.cls}DetailPage({`,
    `  params,`,
    `}: {`,
    `  params: { ${routeParam}: string };`,
    `}) {`,
    `  const id = params.${routeParam};`,
    ...(update ? [`  const router = useRouter();`] : []),
    ...(readOnly
      ? [`  const [item, setItem] = useState<${m.itemType} | null>(null);`]
      : []),
    ...fields.map((f) => `  ${stateHook(f)}`),
    `  const [loading, setLoading] = useState(${detail ? 'true' : 'false'});`,
    ...(update ? [`  const [saving, setSaving] = useState(false);`] : []),
    `  const [error, setError] = useState<string | null>(null);`,
    '',
  ];

  if (detail) {
    const usesData = readOnly || fields.length > 0;
    lines.push(
      `  const load = useCallback(async () => {`,
      `    setLoading(true);`,
      `    setError(null);`,
      `    try {`,
      usesData
        ? `      const data = await ${detail.name}(id);`
        : `      await ${detail.name}(id);`,
      ...(readOnly ? [`      setItem(data);`] : []),
      ...(fields.length
        ? [
            `      // Prefill through an index signature: a body field need not be`,
            `      // part of the designed response shape.`,
            `      const raw = data as Record<string, unknown>;`,
            ...fields.map((f) => `      ${prefill(f)}`),
          ]
        : []),
      `    } catch (e) {`,
      `      setError(e instanceof Error ? e.message : String(e));`,
      `    } finally {`,
      `      setLoading(false);`,
      `    }`,
      `  }, [id]);`,
      '',
      `  useEffect(() => {`,
      `    void load();`,
      `  }, [load]);`,
      '',
    );
  }

  if (update && bodyType) {
    lines.push(
      `  async function onSubmit(e: React.FormEvent) {`,
      `    e.preventDefault();`,
      `    setSaving(true);`,
      `    setError(null);`,
      `    try {`,
      ...jsonParseBlock(fields, '      '),
      `      const body: ${bodyType} = {`,
      ...fields.map((f) => `        ${bodyEntry(f)}`),
      `      };`,
      `      await ${update.name}(id, body);`,
      `      router.push('/${m.slug}');`,
      `    } catch (err) {`,
      `      setError(err instanceof Error ? err.message : String(err));`,
      `    } finally {`,
      `      setSaving(false);`,
      `    }`,
      `  }`,
      '',
    );
  }

  lines.push(
    `  return (`,
    `    <section className="max-w-lg">`,
    `      <h1 className="text-xl font-semibold">{${str(m.name)}}</h1>`,
    `      <p className="mt-1 text-sm text-slate-500">{id}</p>`,
    '',
    ...ERROR_BLOCK,
    '',
    `      {loading ? (`,
    `        <p className="mt-6 text-sm text-slate-500">Loading…</p>`,
    `      ) : (`,
  );

  if (update && bodyType) {
    lines.push(
      `        <form onSubmit={onSubmit} className="mt-6 space-y-4">`,
      ...fields.flatMap((f) => inputBlock(f)),
      `          <button`,
      `            type="submit"`,
      `            disabled={saving}`,
      `            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"`,
      `          >`,
      `            {saving ? 'Saving…' : 'Save'}`,
      `          </button>`,
      `        </form>`,
    );
  } else {
    // Read-only: the design has a detail endpoint but no update.
    lines.push(
      `        <dl className="mt-6 divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">`,
      ...m.fields.map((f) =>
        [
          `          <div className="flex gap-4 px-3 py-2 text-sm">`,
          `            <dt className="w-40 shrink-0 text-slate-500">{${str(f.label)}}</dt>`,
          `            <dd className="break-all">{cell(item?.${f.key})}</dd>`,
          `          </div>`,
        ].join('\n'),
      ),
      `        </dl>`,
    );
  }

  lines.push(
    `      )}`,
    `    </section>`,
    `  );`,
    `}`,
    '',
  );

  return lines.join('\n');
}

// ── Form-field codegen ───────────────────────────────────────────────────────

function stateHook(f: FormField): string {
  if (f.input === 'checkbox') {
    return `const [${f.key}, set${pascal(f.key)}] = useState(false);`;
  }
  return `const [${f.key}, set${pascal(f.key)}] = useState('');`;
}

/**
 * JSON fields are typed `Record<string, unknown>` but edited as text, so they're
 * parsed once up front — a bad paste must fail with a message, not a crash.
 */
function jsonParseBlock(fields: FormField[], indent: string): string[] {
  const json = fields.filter((f) => f.json);
  if (!json.length) return [];
  const lines: string[] = [];
  for (const f of json) {
    lines.push(
      `${indent}let ${f.key}Value: Record<string, unknown> = {};`,
      `${indent}try {`,
      `${indent}  ${f.key}Value = ${f.key}.trim()`,
      `${indent}    ? (JSON.parse(${f.key}) as Record<string, unknown>)`,
      `${indent}    : {};`,
      `${indent}} catch {`,
      `${indent}  setError(${str(`${f.label} must be valid JSON`)});`,
      `${indent}  setSaving(false);`,
      `${indent}  return;`,
      `${indent}}`,
    );
  }
  return lines;
}

/** One entry in the request body literal. */
function bodyEntry(f: FormField): string {
  if (f.input === 'checkbox') return `${f.key},`;
  if (f.json) {
    return f.required
      ? `${f.key}: ${f.key}Value,`
      : `...(${f.key}.trim() === '' ? {} : { ${f.key}: ${f.key}Value }),`;
  }
  if (f.input === 'number') {
    return f.required
      ? `${f.key}: Number(${f.key}),`
      : `...(${f.key} === '' ? {} : { ${f.key}: Number(${f.key}) }),`;
  }
  if (f.input === 'datetime-local') {
    // `datetime-local` yields "2026-01-01T09:00" — not an ISO instant, which is
    // what the API's IsDateString expects.
    return f.required
      ? `${f.key}: new Date(${f.key}).toISOString(),`
      : `...(${f.key} === '' ? {} : { ${f.key}: new Date(${f.key}).toISOString() }),`;
  }
  return f.required ? `${f.key},` : `...(${f.key} === '' ? {} : { ${f.key} }),`;
}

function prefill(f: FormField): string {
  const setter = `set${pascal(f.key)}`;
  if (f.input === 'checkbox') return `${setter}(Boolean(raw.${f.key}));`;
  if (f.json) {
    return `${setter}(raw.${f.key} == null ? '' : JSON.stringify(raw.${f.key}, null, 2));`;
  }
  return `${setter}(raw.${f.key} == null ? '' : String(raw.${f.key}));`;
}

function inputBlock(f: FormField): string[] {
  const setter = `set${pascal(f.key)}`;
  const label = `          <label className="block text-sm font-medium text-slate-700">{${str(
    f.label,
  )}}</label>`;

  if (f.input === 'checkbox') {
    return [
      `        <div>`,
      `          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">`,
      `            <input`,
      `              type="checkbox"`,
      `              checked={${f.key}}`,
      `              onChange={(e) => ${setter}(e.target.checked)}`,
      `              className="h-4 w-4"`,
      `            />`,
      `            {${str(f.label)}}`,
      `          </label>`,
      `        </div>`,
    ];
  }

  if (f.json) {
    return [
      `        <div>`,
      label,
      `          <textarea`,
      `            value={${f.key}}`,
      `            onChange={(e) => ${setter}(e.target.value)}`,
      `            rows={4}`,
      `            placeholder="{}"`,
      `            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"`,
      `          />`,
      `        </div>`,
    ];
  }

  return [
    `        <div>`,
    label,
    `          <input`,
    `            type="${f.input}"`,
    `            value={${f.key}}`,
    `            onChange={(e) => ${setter}(e.target.value)}`,
    ...(f.required ? [`            required`] : []),
    `            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"`,
    `          />`,
    `        </div>`,
  ];
}

/** The error banner, identical on every page. */
const ERROR_BLOCK = [
  `      {error && (`,
  `        <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">`,
  `          {error}`,
  `        </p>`,
  `      )}`,
];

// ── Shell + static files ─────────────────────────────────────────────────────

function renderLayout(views: ModuleView[]): string {
  return [
    `import type { Metadata } from 'next';`,
    `import Link from 'next/link';`,
    `import './globals.css';`,
    '',
    `export const metadata: Metadata = {`,
    `  title: 'Generated App',`,
    `  description: 'Scaffolded by Archivato AI Builder.',`,
    `};`,
    '',
    `export default function RootLayout({`,
    `  children,`,
    `}: {`,
    `  children: React.ReactNode;`,
    `}) {`,
    `  return (`,
    `    <html lang="en">`,
    `      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">`,
    `        <header className="border-b border-slate-200 bg-white">`,
    `          <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-6 py-4">`,
    `            <Link href="/" className="font-semibold">`,
    `              Generated App`,
    `            </Link>`,
    ...views.map((m) =>
      [
        `            <Link`,
        `              href="/${m.slug}"`,
        `              className="text-sm text-slate-600 hover:text-slate-900"`,
        `            >`,
        `              {${str(m.name)}}`,
        `            </Link>`,
      ].join('\n'),
    ),
    `          </nav>`,
    `        </header>`,
    `        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>`,
    `      </body>`,
    `    </html>`,
    `  );`,
    `}`,
    '',
  ].join('\n');
}

function renderHome(idea: string, views: ModuleView[]): string {
  return [
    `import Link from 'next/link';`,
    '',
    `export default function HomePage() {`,
    `  return (`,
    `    <section>`,
    `      <h1 className="text-2xl font-semibold">Generated App</h1>`,
    `      <p className="mt-2 max-w-2xl text-sm text-slate-600">{${str(oneLine(idea))}}</p>`,
    '',
    ...(views.length
      ? [
          `      <div className="mt-8 grid gap-4 sm:grid-cols-2">`,
          ...views.map((m) =>
            [
              `        <Link`,
              `          href="/${m.slug}"`,
              `          className="rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400"`,
              `        >`,
              `          <h2 className="font-medium">{${str(m.name)}}</h2>`,
              `          <p className="mt-1 text-sm text-slate-500">`,
              `            {${str(`${m.endpointCount} endpoint${m.endpointCount === 1 ? '' : 's'}`)}}`,
              `          </p>`,
              `        </Link>`,
            ].join('\n'),
          ),
          `      </div>`,
        ]
      : [
          `      <p className="mt-8 text-sm text-slate-500">No API modules in the design.</p>`,
        ]),
    `    </section>`,
    `  );`,
    `}`,
    '',
  ].join('\n');
}

const API_CLIENT = `/**
 * The generated API client. Every module's functions in \`lib/api/*\` go through
 * \`apiFetch\`, so auth headers, retries, or a different base URL are a one-file
 * change here.
 */

/** Base URL of the generated backend (its global \`/api\` prefix included). */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Typed fetch against the generated API. Throws \`ApiError\` on a non-2xx. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(\`\${API_URL}\${path}\`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new ApiError(res.status, detail || \`Request failed (\${res.status})\`);
  }
  // 204 and empty bodies are valid successes (DELETE, mostly).
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Escape a value being interpolated into a path segment. */
export function param(value: string | number): string {
  return encodeURIComponent(String(value));
}

/**
 * Serialize a query object; omits undefined/null so optional filters vanish.
 *
 * Takes \`object\`, not \`Record<string, unknown>\`: the generated \`*Query\` types are
 * interfaces, and an interface has no implicit index signature — it would not be
 * assignable to a Record.
 */
export function qs(query?: object): string {
  if (!query) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? \`?\${encoded}\` : '';
}
`;

const FORMAT = `/** Render any API value as display text. Never throws, never prints "undefined". */
export function cell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
`;

const GLOBALS_CSS = `@tailwind base;
@tailwind components;
@tailwind utilities;
`;

function rootFiles(input: ScaffoldInput, views: ModuleView[]): ScaffoldFile[] {
  const pkg = {
    name: 'generated-frontend',
    version: '0.1.0',
    private: true,
    scripts: {
      dev: `next dev -p ${FRONTEND_DEV_PORT}`,
      build: 'next build',
      start: `next start -p ${FRONTEND_DEV_PORT}`,
    },
    dependencies: {
      next: '^14.2.0',
      react: '^18.3.0',
      'react-dom': '^18.3.0',
    },
    devDependencies: {
      '@types/node': '^20.14.0',
      '@types/react': '^18.3.0',
      '@types/react-dom': '^18.3.0',
      autoprefixer: '^10.4.19',
      postcss: '^8.4.38',
      tailwindcss: '^3.4.0',
      typescript: '^5.4.0',
    },
  };

  const tsconfig = {
    compilerOptions: {
      target: 'ES2021',
      lib: ['dom', 'dom.iterable', 'esnext'],
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: 'preserve',
      incremental: true,
      skipLibCheck: true,
      plugins: [{ name: 'next' }],
      paths: { '@/*': ['./*'] },
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
    exclude: ['node_modules'],
  };

  return [
    { path: 'package.json', content: JSON.stringify(pkg, null, 2) + '\n' },
    { path: 'tsconfig.json', content: JSON.stringify(tsconfig, null, 2) + '\n' },
    {
      path: 'next.config.js',
      content: [
        `/** @type {import('next').NextConfig} */`,
        'const nextConfig = { reactStrictMode: true };',
        '',
        'module.exports = nextConfig;',
        '',
      ].join('\n'),
    },
    {
      path: 'postcss.config.js',
      content: 'module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };\n',
    },
    {
      path: 'tailwind.config.ts',
      content: [
        `import type { Config } from 'tailwindcss';`,
        '',
        'const config: Config = {',
        `  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],`,
        '  theme: { extend: {} },',
        '  plugins: [],',
        '};',
        '',
        'export default config;',
        '',
      ].join('\n'),
    },
    {
      path: '.gitignore',
      content: ['node_modules/', '.next/', '.env*.local', 'next-env.d.ts', ''].join(
        '\n',
      ),
    },
    {
      path: '.env.example',
      content: [
        '# Copy to .env.local. Must include the backend\'s global /api prefix.',
        'NEXT_PUBLIC_API_URL=http://localhost:3000/api',
        '',
      ].join('\n'),
    },
    { path: 'README.md', content: renderReadme(input, views) },
  ];
}

function renderReadme(input: ScaffoldInput, views: ModuleView[]): string {
  const pages = views
    .map((m) => {
      const bits = [
        m.list ? 'list' : null,
        m.create ? 'create' : null,
        m.detail || m.update ? 'detail/edit' : null,
        m.remove ? 'delete' : null,
      ].filter(Boolean);
      return `- **${m.name}** (\`/${m.slug}\`) — ${bits.length ? bits.join(', ') : 'no wired pages'}`;
    })
    .join('\n');

  return [
    '# Generated Frontend',
    '',
    '> Scaffolded by **Archivato AI Builder** from your API design. Next.js',
    '> (App Router) + Tailwind, talking to the generated backend.',
    '',
    '## The idea',
    '',
    oneLine(input.idea),
    '',
    '## Getting started',
    '',
    'Start the backend first (it listens on `:3000`), then:',
    '',
    '```bash',
    'npm install',
    'cp .env.example .env.local   # NEXT_PUBLIC_API_URL',
    `npm run dev                  # http://localhost:${FRONTEND_DEV_PORT}`,
    '```',
    '',
    '## Pages',
    '',
    pages || '_No API modules._',
    '',
    '## How it fits together',
    '',
    '- `lib/api-client.ts` — one `apiFetch` all requests go through. Add auth',
    '  headers here.',
    '- `lib/api/*.ts` — a typed function per endpoint. The names match the',
    '  backend controller handlers.',
    '',
    '## Known assumptions',
    '',
    'These come from the *design*, not from a running API — check them:',
    '',
    '1. **List endpoints return an array.** If yours wraps results',
    '   (`{ items: [...] }`), unwrap it in the module client.',
    '2. **Item fields are all optional**, because the response schema is a design,',
    '   not a contract. Tighten the types once the endpoints are implemented.',
    '3. **The backend must allow this origin** (CORS `WEB_ORIGIN`) — the generated',
    '   backend already defaults to it.',
    '',
  ].join('\n');
}

// ── Text helpers ─────────────────────────────────────────────────────────────

/**
 * Embed arbitrary design text in JSX as a string expression. LLM-written names
 * and summaries contain quotes, braces, and newlines — raw JSX text wouldn't
 * compile.
 */
function str(text: string): string {
  return JSON.stringify(text ?? '');
}

/** `author_id` → `Author Id`. */
function label(name: string): string {
  const w = words(name);
  if (!w.length) return 'Field';
  return w.map((x) => x[0].toUpperCase() + x.slice(1)).join(' ');
}
