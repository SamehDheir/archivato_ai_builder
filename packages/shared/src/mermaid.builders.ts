import type { ApiDesign, ApiEndpoint, ApiModule } from './api-design';
import type { DatabaseDesign, Relation } from './database-design';
import type { Diagram, SequenceFlow } from './diagrams';
import type { SystemDesign } from './system-design';

/**
 * Deterministic Mermaid builders: turn the structured design artifacts into
 * Mermaid source (rendered client-side). Pure + dependency-free, so they live in
 * the shared package and are used by BOTH the API (the `diagrams` module) and
 * the web client (e.g. the ER diagram on the Database Design view). Each builder
 * defends against empty/partial input.
 */

export interface DiagramInputs {
  systemDesign: SystemDesign | null;
  databaseDesign: DatabaseDesign | null;
  apiDesign: ApiDesign | null;
}

/** Build all six diagrams; a missing prerequisite yields a `note` instead. */
export function buildAllDiagrams(inputs: DiagramInputs): Diagram[] {
  const { systemDesign, databaseDesign, apiDesign } = inputs;
  return [
    wrap('flowchart', 'Flow Chart', systemDesign, 'system design', () =>
      buildFlowchart(systemDesign as SystemDesign),
    ),
    wrap('sequence', 'Sequence Diagram', apiDesign, 'API design', () =>
      buildSequence(apiDesign as ApiDesign, systemDesign),
    ),
    wrap('class', 'Class Diagram', databaseDesign, 'database design', () =>
      buildClassDiagram(databaseDesign as DatabaseDesign),
    ),
    wrap('erd', 'Entity-Relationship (ERD)', databaseDesign, 'database design', () =>
      buildErd(databaseDesign as DatabaseDesign),
    ),
    wrap('microservices', 'Microservices / Components', systemDesign, 'system design', () =>
      buildMicroservices(systemDesign as SystemDesign),
    ),
    wrap('deployment', 'Deployment Diagram', systemDesign, 'system design', () =>
      buildDeployment(systemDesign as SystemDesign),
    ),
  ];
}

function wrap(
  kind: Diagram['kind'],
  title: string,
  prerequisite: unknown,
  prerequisiteName: string,
  build: () => string,
): Diagram {
  if (!prerequisite) {
    return {
      kind,
      title,
      mermaid: '',
      note: `Generate the ${prerequisiteName} first to see this diagram.`,
    };
  }
  return { kind, title, mermaid: build() };
}

// ── ERD ─────────────────────────────────────────────────────────────────────

export function buildErd(db: DatabaseDesign): string {
  const lines = ['erDiagram'];

  for (const entity of db.entities) {
    lines.push(`  ${erdName(entity.name)} {`);
    for (const col of entity.columns) {
      const key = col.primaryKey
        ? ' PK'
        : col.references
          ? ' FK'
          : col.unique
            ? ' UK'
            : '';
      lines.push(`    ${typeName(col.type)} ${ident(col.name)}${key}`);
    }
    lines.push('  }');
  }

  for (const rel of db.relations) {
    lines.push(
      `  ${erdName(rel.from)} ${cardinality(rel)} ${erdName(rel.to)} : "${label(
        rel.description ?? rel.type,
      )}"`,
    );
  }

  return lines.join('\n');
}

function cardinality(rel: Relation): string {
  switch (rel.type) {
    case 'one-to-one':
      return '||--||';
    case 'many-to-many':
      return '}o--o{';
    case 'one-to-many':
    default:
      return '||--o{';
  }
}

// ── Class diagram ────────────────────────────────────────────────────────────

export function buildClassDiagram(db: DatabaseDesign): string {
  const lines = ['classDiagram'];

  for (const entity of db.entities) {
    lines.push(`  class ${className(entity.name)} {`);
    for (const col of entity.columns) {
      const marker = col.primaryKey ? '+' : col.references ? '#' : '-';
      lines.push(`    ${marker}${typeName(col.type)} ${ident(col.name)}`);
    }
    lines.push('  }');
  }

  for (const rel of db.relations) {
    const [a, b] = classCardinality(rel);
    lines.push(
      `  ${className(rel.from)} "${a}" --> "${b}" ${className(rel.to)} : ${ident(
        rel.type,
      )}`,
    );
  }

  return lines.join('\n');
}

function classCardinality(rel: Relation): [string, string] {
  switch (rel.type) {
    case 'one-to-one':
      return ['1', '1'];
    case 'many-to-many':
      return ['*', '*'];
    case 'one-to-many':
    default:
      return ['1', '*'];
  }
}

// ── Microservices / component diagram ────────────────────────────────────────

export function buildMicroservices(sys: SystemDesign): string {
  const lines = ['flowchart LR'];
  for (const svc of sys.services) {
    lines.push(`  ${nodeId(svc.name)}["${label(svc.name)}"]`);
  }
  const known = new Set(sys.services.map((s) => s.name));
  for (const svc of sys.services) {
    for (const dep of svc.dependencies) {
      if (known.has(dep)) {
        lines.push(`  ${nodeId(svc.name)} --> ${nodeId(dep)}`);
      }
    }
  }
  if (sys.services.length === 0) lines.push('  empty["No services defined"]');
  return lines.join('\n');
}

// ── Deployment diagram ───────────────────────────────────────────────────────

export function buildDeployment(sys: SystemDesign): string {
  const tech = (layer: string, fallback: string) =>
    sys.techStack.find((t) => t.layer.toLowerCase().includes(layer))
      ?.technology ?? fallback;

  const web = tech('frontend', 'Web App');
  const api = tech('backend', 'API');
  const dbTech = tech('database', 'Database');
  const cache = sys.techStack.find((t) => t.layer.toLowerCase().includes('cache'));
  const queue = sys.techStack.find((t) => t.layer.toLowerCase().includes('queue'));

  const lines = ['flowchart TB'];
  lines.push('  Client(["Client / Browser"])');
  lines.push(`  Web["${label(web)}"]`);
  lines.push('  Client --> Web');

  if (sys.architecture === 'microservices') {
    lines.push(`  Gateway["${label(api)} (Gateway)"]`);
    lines.push('  Web --> Gateway');
    for (const svc of sys.services) {
      lines.push(`  ${nodeId(svc.name)}["${label(svc.name)} service"]`);
      lines.push(`  Gateway --> ${nodeId(svc.name)}`);
      lines.push(`  ${nodeId(svc.name)} --> DB`);
    }
  } else {
    lines.push(`  API["${label(api)}"]`);
    lines.push('  Web --> API');
    lines.push('  API --> DB');
  }

  lines.push(`  DB[("${label(dbTech)}")]`);
  if (cache) {
    lines.push(`  Cache[("${label(cache.technology)}")]`);
    lines.push(`  ${sys.architecture === 'microservices' ? 'Gateway' : 'API'} --> Cache`);
  }
  if (queue) {
    lines.push(`  Queue[["${label(queue.technology)}"]]`);
    lines.push(`  ${sys.architecture === 'microservices' ? 'Gateway' : 'API'} --> Queue`);
  }
  return lines.join('\n');
}

// ── Sequence diagram ─────────────────────────────────────────────────────────

export function buildSequence(
  api: ApiDesign,
  sys: SystemDesign | null,
): string {
  // Pick a representative write endpoint (else the first endpoint available).
  const module = api.modules.find((m) => m.endpoints.length > 0);
  const endpoint =
    module?.endpoints.find((e) => e.method !== 'GET') ?? module?.endpoints[0];

  const serviceName = module?.name ?? sys?.services[0]?.name ?? 'Service';
  const method = endpoint?.method ?? 'POST';
  const path = endpoint?.path ?? '/api/resource';

  const lines = [
    'sequenceDiagram',
    '  actor C as Client',
    '  participant A as API',
    `  participant S as ${label(serviceName)}`,
    '  participant D as Database',
    `  C->>A: ${method} ${path}`,
    '  A->>A: Authenticate & validate',
    `  A->>S: handle ${label(endpoint?.summary ?? 'request')}`,
    '  S->>D: query / persist',
    '  D-->>S: rows',
    '  S-->>A: result',
    `  A-->>C: ${(endpoint?.statusCodes?.[0] ?? 200)} response`,
  ];
  return lines.join('\n');
}

// ── Per-flow sequence diagrams ───────────────────────────────────────────────

/** How many flow diagrams to emit (keeps the picker + payload bounded). */
const MAX_FLOWS = 60;

type FlowKind =
  | 'login'
  | 'register'
  | 'refresh'
  | 'read'
  | 'create'
  | 'write'
  | 'delete';

/**
 * One sequence diagram **per API endpoint**, grouped by module — so every
 * meaningful interaction (login, create X, list Y, delete Z…) has its own flow,
 * not just the single representative {@link buildSequence}. Deterministic; the
 * steps are shaped by the endpoint's method, its module, and whether the system
 * design provisions a cache/queue. Returns `[]` without an API design.
 */
export function buildSequenceFlows(
  api: ApiDesign | null,
  sys: SystemDesign | null,
): SequenceFlow[] {
  if (!api) return [];
  const hasCache = !!sys?.techStack.some((t) => /cache/i.test(t.layer));
  const hasQueue = !!sys?.techStack.some((t) => /queue|message|broker/i.test(t.layer));

  const flows: SequenceFlow[] = [];
  for (const module of api.modules) {
    for (const endpoint of module.endpoints) {
      if (flows.length >= MAX_FLOWS) return flows;
      flows.push({
        id: flowId(module.name, endpoint.method, endpoint.path),
        group: label(module.name),
        title: `${endpoint.method} ${endpoint.path} — ${label(endpoint.summary || 'request')}`,
        method: endpoint.method,
        path: endpoint.path,
        mermaid: buildFlowSequence(module, endpoint, sys, { hasCache, hasQueue }),
      });
    }
  }
  return flows;
}

function classifyFlow(module: ApiModule, endpoint: ApiEndpoint): FlowKind {
  const hay = `${module.name} ${endpoint.path} ${endpoint.summary}`.toLowerCase();
  const isAuth = module.name.toLowerCase() === 'auth' || /\bauth\b/.test(hay);
  if (isAuth) {
    if (/login|sign[\s-]?in/.test(hay)) return 'login';
    if (/register|sign[\s-]?up/.test(hay)) return 'register';
    if (/refresh/.test(hay)) return 'refresh';
  }
  switch (endpoint.method) {
    case 'GET':
      return 'read';
    case 'POST':
      return 'create';
    case 'DELETE':
      return 'delete';
    default:
      return 'write';
  }
}

function buildFlowSequence(
  module: ApiModule,
  endpoint: ApiEndpoint,
  sys: SystemDesign | null,
  caps: { hasCache: boolean; hasQueue: boolean },
): string {
  const svc = label(module.name || sys?.services[0]?.name || 'Service');
  const { method, path } = endpoint;
  const summary = label(endpoint.summary || 'request');
  const ok =
    endpoint.statusCodes?.find((c) => c < 400) ?? (method === 'POST' ? 201 : 200);
  const kind = classifyFlow(module, endpoint);

  const useCache = caps.hasCache && kind === 'read';
  const useQueue = caps.hasQueue && (kind === 'create' || kind === 'write');

  const head = [
    'sequenceDiagram',
    '  actor C as Client',
    '  participant A as API',
    `  participant S as ${svc}`,
    '  participant D as Database',
  ];
  if (useCache) head.push('  participant Ca as Cache');
  if (useQueue) head.push('  participant Q as Queue');

  const body: string[] = [`  C->>A: ${method} ${path}`];
  switch (kind) {
    case 'login':
      body.push('  A->>A: Validate credentials payload');
      body.push(`  A->>S: ${summary}`);
      body.push('  S->>D: Find user by email');
      body.push('  D-->>S: User record');
      body.push('  S->>S: Verify password hash');
      body.push('  S-->>A: Issue access + refresh tokens');
      body.push(`  A-->>C: ${ok} + Set-Cookie (httpOnly)`);
      break;
    case 'register':
      body.push('  A->>A: Validate & check uniqueness');
      body.push(`  A->>S: ${summary}`);
      body.push('  S->>D: Insert user (hashed password)');
      body.push('  D-->>S: New user');
      body.push('  S-->>A: Issue tokens + queue verification email');
      body.push(`  A-->>C: ${ok} + Set-Cookie`);
      break;
    case 'refresh':
      body.push('  A->>S: Rotate refresh token');
      body.push('  S->>D: Validate + revoke old token');
      body.push('  D-->>S: OK');
      body.push('  S-->>A: New access + refresh tokens');
      body.push(`  A-->>C: ${ok} + Set-Cookie`);
      break;
    case 'read':
      body.push('  A->>A: Authenticate & authorize');
      if (useCache) {
        body.push('  A->>Ca: Lookup cached result');
        body.push('  Ca-->>A: miss');
      }
      body.push(`  A->>S: ${summary}`);
      body.push('  S->>D: Query');
      body.push('  D-->>S: Rows');
      if (useCache) body.push('  A->>Ca: Store result (TTL)');
      body.push('  S-->>A: Result');
      body.push(`  A-->>C: ${ok} response`);
      break;
    case 'delete':
      body.push('  A->>A: Authenticate & authorize (owner)');
      body.push(`  A->>S: ${summary}`);
      body.push('  S->>D: Delete (cascade)');
      body.push('  D-->>S: OK');
      body.push('  S-->>A: Deleted');
      body.push(`  A-->>C: ${ok} response`);
      break;
    case 'create':
    case 'write':
    default:
      body.push('  A->>A: Authenticate, authorize & validate');
      body.push(`  A->>S: ${summary}`);
      body.push('  S->>D: Persist changes');
      body.push('  D-->>S: Saved');
      if (useQueue) body.push('  S->>Q: Enqueue side-effects (email, jobs)');
      body.push('  S-->>A: Result');
      body.push(`  A-->>C: ${ok} response`);
      break;
  }

  return [...head, ...body].join('\n');
}

/** Stable, Mermaid/React-safe id for a flow. */
function flowId(moduleName: string, method: string, path: string): string {
  return `${nodeId(moduleName)}_${method}_${path}`
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_');
}

// ── Flow chart (request lifecycle) ───────────────────────────────────────────

export function buildFlowchart(sys: SystemDesign): string {
  const lines = ['flowchart TD'];
  lines.push('  U(["User"]) --> R{Authenticated?}');
  lines.push('  R -- No --> L["Login / Auth"] --> R');
  lines.push('  R -- Yes --> API["API Gateway"]');

  const services = sys.services.filter((s) => s.name.toLowerCase() !== 'auth');
  if (services.length === 0) {
    lines.push('  API --> SVC["Application services"] --> DB[("Database")]');
  } else {
    for (const svc of services.slice(0, 6)) {
      lines.push(`  API --> ${nodeId(svc.name)}["${label(svc.name)}"]`);
      lines.push(`  ${nodeId(svc.name)} --> DB`);
    }
    lines.push('  DB[("Database")]');
  }
  lines.push('  DB --> RESP["Response"] --> U');
  return lines.join('\n');
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** A safe Mermaid node id (letters/digits/underscore, leading letter). */
function nodeId(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
  return /^[a-zA-Z]/.test(cleaned) ? cleaned : `n_${cleaned}`;
}

/** ERD entity names: Mermaid allows letters/digits/underscore only. */
function erdName(name: string): string {
  return nodeId(name).toUpperCase();
}

function className(name: string): string {
  return nodeId(name);
}

/** A column/identifier safe for Mermaid attribute lines. */
function ident(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * A Mermaid-safe attribute TYPE token. Real models emit SQL types like
 * `varchar(255)`, `decimal(10,2)`, or `timestamp with time zone`; the
 * parentheses, commas, and spaces break Mermaid's ERD/class attribute grammar
 * (which expects a single `type name` token pair). Collapse anything outside
 * `[a-zA-Z0-9_]` to underscores so the type stays one readable token.
 */
function typeName(type: string): string {
  const cleaned = (type ?? '')
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'string';
}

/** Escape a quoted label (strip characters that break Mermaid). */
function label(text: string): string {
  return text.replace(/["\n\r]/g, ' ').replace(/[{}|]/g, '').trim() || 'item';
}
