import type {
  ApiDesign,
  DatabaseDesign,
  Diagram,
  Relation,
  SystemDesign,
} from '@archivato/shared';

/**
 * Deterministic Mermaid builders: turn the structured design artifacts into
 * Mermaid source (rendered client-side). Pure + dependency-free, like the
 * export builders. Each builder defends against empty/partial input.
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
      lines.push(`    ${col.type} ${ident(col.name)}${key}`);
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
      lines.push(`    ${marker}${col.type} ${ident(col.name)}`);
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

/** Escape a quoted label (strip characters that break Mermaid). */
function label(text: string): string {
  return text.replace(/["\n\r]/g, ' ').replace(/[{}|]/g, '').trim() || 'item';
}
