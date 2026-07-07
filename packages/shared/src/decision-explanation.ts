/**
 * "Explain this decision" — an on-demand rationale for a single choice in the
 * System Design (the architecture style, a tech-stack pick, or a service
 * boundary). Produced by the `ArchitectExplainer` agent (LLM) with the pure,
 * runtime-free deterministic fallback below, so it always yields a coherent
 * answer offline and in tests. Ephemeral — never persisted.
 */

import type { SystemDesign } from './system-design';

/** Which kind of decision the user asked about. */
export type DecisionKind = 'architecture' | 'tech' | 'service';

/** Client-supplied pointer to the decision to explain. */
export interface DecisionRef {
  kind: DecisionKind;
  /**
   * The subject key: for `tech` the `layer`, for `service` the service `name`.
   * Ignored for `architecture` (there is only one).
   */
  key: string;
}

export interface DecisionAlternative {
  name: string;
  /** Why it's a reasonable option but wasn't the pick here. */
  note: string;
}

export interface DecisionExplanation {
  kind: DecisionKind;
  /** Echoes the requested key (layer/service name; empty for architecture). */
  key: string;
  /** The concrete choice, e.g. "modular_monolith", "PostgreSQL", "Billing". */
  subject: string;
  /** One-line human title, e.g. "Why PostgreSQL for the database layer". */
  title: string;
  /** Plain-language explanation of why this choice fits the project. */
  rationale: string;
  /** Concrete tradeoffs accepted by this choice. */
  tradeoffs: string[];
  /** Reasonable alternatives and why they weren't chosen. */
  alternatives: DecisionAlternative[];
  /** Things to watch / risks as the system grows. */
  risks: string[];
}

// ── deterministic fallback ─────────────────────────────────────────────────

/**
 * Build a decision explanation from static architectural knowledge — no LLM.
 * Used as the agent's fallback (and unit-tested). Always returns a complete,
 * shape-valid explanation, even for an unknown tech or a missing subject.
 */
export function buildDecisionExplanation(
  design: SystemDesign,
  ref: DecisionRef,
): DecisionExplanation {
  switch (ref.kind) {
    case 'architecture':
      return explainArchitecture(design);
    case 'tech':
      return explainTech(design, ref.key);
    case 'service':
    default:
      return explainService(design, ref.key);
  }
}

function explainArchitecture(design: SystemDesign): DecisionExplanation {
  const subject = design.architecture;
  const serviceCount = design.services.length;
  const base = ARCHITECTURE_KB[subject] ?? ARCHITECTURE_KB.modular_monolith;
  return {
    kind: 'architecture',
    key: '',
    subject,
    title: `Why a ${pretty(subject)} architecture`,
    rationale:
      design.architectureRationale?.trim() ||
      `${base.rationale} With ${serviceCount} service${
        serviceCount === 1 ? '' : 's'
      } identified, this keeps the system coherent while matching its scale.`,
    tradeoffs: base.tradeoffs,
    alternatives: base.alternatives,
    risks: base.risks,
  };
}

function explainTech(design: SystemDesign, layerKey: string): DecisionExplanation {
  const choice =
    design.techStack.find((t) => t.layer === layerKey) ??
    design.techStack.find(
      (t) => t.layer.toLowerCase() === layerKey.toLowerCase(),
    );
  const layer = choice?.layer ?? layerKey;
  const tech = choice?.technology ?? 'the selected technology';
  const kb = TECH_KB[normalizeTech(tech)];
  return {
    kind: 'tech',
    key: layerKey,
    subject: tech,
    title: `Why ${tech} for the ${layer} layer`,
    rationale:
      choice?.rationale?.trim() ||
      kb?.rationale ||
      `${tech} is a well-supported, widely adopted choice for the ${layer} layer with a strong ecosystem and clear operational path.`,
    tradeoffs: kb?.tradeoffs ?? [
      `Commits the team to ${tech}'s ecosystem and operational model.`,
      'Switching later means a migration; validate it fits the workload early.',
    ],
    alternatives: kb?.alternatives ?? [
      {
        name: 'A managed equivalent',
        note: 'Trades control for lower operational burden.',
      },
    ],
    risks: kb?.risks ?? [
      `Ensure the team has (or can build) operational expertise in ${tech}.`,
    ],
  };
}

function explainService(design: SystemDesign, name: string): DecisionExplanation {
  const svc =
    design.services.find((s) => s.name === name) ??
    design.services.find((s) => s.name.toLowerCase() === name.toLowerCase());
  const subject = svc?.name ?? name;
  const deps = svc?.dependencies ?? [];
  const dependents = design.services
    .filter((s) => s.dependencies.includes(subject))
    .map((s) => s.name);
  const responsibility = svc?.responsibility?.trim();

  return {
    kind: 'service',
    key: name,
    subject,
    title: `Why a separate ${subject} service`,
    rationale: responsibility
      ? `${subject} owns a distinct responsibility — ${lowerFirst(
          responsibility,
        )} — so isolating it keeps that concern cohesive and independently testable, and gives it a clear owner as the system grows.`
      : `${subject} groups a distinct set of responsibilities behind one boundary, keeping the concern cohesive and independently testable.`,
    tradeoffs: [
      deps.length
        ? `Depends on ${deps.join(', ')}, so its contracts must stay stable.`
        : 'Standalone today, but new features may pull in cross-service calls.',
      design.architecture === 'microservices'
        ? 'As its own deployable it adds a network hop and its own ops surface.'
        : 'As an in-process module the boundary is a convention — enforce it in code review.',
    ],
    alternatives: [
      {
        name: 'Merge into a neighbouring module',
        note: 'Fewer moving parts, at the cost of a fuzzier responsibility.',
      },
      ...(design.architecture !== 'microservices'
        ? [
            {
              name: 'Extract to its own service',
              note: 'Worth it only once it needs independent scaling or deploys.',
            },
          ]
        : []),
    ],
    risks: [
      dependents.length
        ? `${dependents.join(', ')} depend on it — a breaking change ripples outward.`
        : 'Keep its public contract small so it stays easy to change.',
    ],
  };
}

// ── knowledge bases ────────────────────────────────────────────────────────

interface KbEntry {
  rationale: string;
  tradeoffs: string[];
  alternatives: DecisionAlternative[];
  risks: string[];
}

const ARCHITECTURE_KB: Record<string, KbEntry> = {
  monolith: {
    rationale:
      'A single deployable is the fastest way to ship: one codebase, one pipeline, no network boundaries or distributed-systems overhead.',
    tradeoffs: [
      'The whole app scales as one unit — you can’t scale a hot path alone.',
      'Without discipline, module boundaries erode over time.',
    ],
    alternatives: [
      {
        name: 'Modular monolith',
        note: 'Same single deploy, but enforced module seams for a later split.',
      },
      {
        name: 'Microservices',
        note: 'Independent scale/deploy, but far more operational complexity.',
      },
    ],
    risks: [
      'Watch for the codebase growing into a big ball of mud; introduce module seams early.',
    ],
  },
  modular_monolith: {
    rationale:
      'A modular monolith keeps clear module boundaries inside one deployable — most of the maintainability of services without the distributed-systems tax.',
    tradeoffs: [
      'Still one deploy and one runtime — modules can’t scale independently.',
      'Boundaries are enforced by convention, not the network.',
    ],
    alternatives: [
      {
        name: 'Plain monolith',
        note: 'Simpler still, but no explicit seams to split on later.',
      },
      {
        name: 'Microservices',
        note: 'Only once modules genuinely need independent scale or teams.',
      },
    ],
    risks: [
      'Keep inter-module calls going through clear interfaces so a future extraction stays cheap.',
    ],
  },
  microservices: {
    rationale:
      'Independent services let hot paths scale and deploy on their own and let teams own boundaries — a fit when the domain and traffic genuinely warrant it.',
    tradeoffs: [
      'Distributed systems add network calls, partial failure, and eventual consistency.',
      'Operational surface multiplies: per-service CI/CD, observability, and infra.',
    ],
    alternatives: [
      {
        name: 'Modular monolith',
        note: 'Get boundaries first; split out a service only when a real need appears.',
      },
    ],
    risks: [
      'Premature decomposition is costly — make sure the scale/team pressure is real before paying it.',
    ],
  },
};

/** A compact map of common stack picks → why/tradeoffs. Keyed on a normalized name. */
const TECH_KB: Record<string, KbEntry> = {
  postgresql: {
    rationale:
      'PostgreSQL is a battle-tested relational database with strong consistency, rich SQL, JSONB for semi-structured data, and a huge ecosystem — a safe default for transactional data.',
    tradeoffs: [
      'Vertical scaling first; horizontal scale needs read replicas or sharding.',
      'Relational modelling upfront vs. schemaless flexibility.',
    ],
    alternatives: [
      { name: 'MySQL', note: 'Comparable relational option; weaker on advanced types.' },
      { name: 'MongoDB', note: 'Schemaless flexibility, weaker multi-row transactions.' },
    ],
    risks: ['Add indexes and connection pooling before read traffic grows.'],
  },
  mysql: {
    rationale:
      'MySQL is a mature, widely hosted relational database with excellent tooling and operational familiarity.',
    tradeoffs: [
      'Fewer advanced types/features than PostgreSQL (e.g. JSONB, extensions).',
    ],
    alternatives: [
      { name: 'PostgreSQL', note: 'Richer types and stricter SQL compliance.' },
    ],
    risks: ['Confirm the storage engine and isolation levels match your needs.'],
  },
  mongodb: {
    rationale:
      'MongoDB’s document model suits flexible, evolving schemas and denormalized read patterns.',
    tradeoffs: [
      'Multi-document transactions and joins are weaker than in a relational DB.',
      'Schema flexibility can drift without discipline.',
    ],
    alternatives: [
      { name: 'PostgreSQL', note: 'Relational integrity plus JSONB when you need documents.' },
    ],
    risks: ['Model access patterns first — document design is hard to change later.'],
  },
  redis: {
    rationale:
      'Redis is an in-memory store ideal for caching, sessions, rate limiting, and lightweight queues — very low latency.',
    tradeoffs: [
      'In-memory, so capacity is bounded by RAM and durability is a tradeoff.',
    ],
    alternatives: [
      { name: 'Memcached', note: 'Simpler cache, without Redis’s data structures.' },
    ],
    risks: ['Set eviction policy + persistence deliberately for your use.'],
  },
  nestjs: {
    rationale:
      'NestJS gives a batteries-included, modular TypeScript backend (DI, guards, pipes) that scales cleanly with a modular-monolith design.',
    tradeoffs: [
      'More structure/boilerplate than a minimal framework like Express.',
    ],
    alternatives: [
      { name: 'Express', note: 'Lighter and unopinionated; you assemble the structure.' },
      { name: 'Fastify', note: 'Higher throughput; smaller ecosystem of conventions.' },
    ],
    risks: ['Lean on modules/DI so boundaries stay clean as it grows.'],
  },
  express: {
    rationale:
      'Express is a minimal, ubiquitous Node web framework — maximum flexibility and a vast middleware ecosystem.',
    tradeoffs: [
      'Unopinionated: you own structure, validation, and conventions.',
    ],
    alternatives: [
      { name: 'NestJS', note: 'Opinionated structure + DI out of the box.' },
    ],
    risks: ['Without conventions, larger apps drift toward inconsistency.'],
  },
  'next.js': {
    rationale:
      'Next.js pairs React with SSR/SSG, file-based routing, and first-class deployment — strong for SEO-friendly, fast frontends.',
    tradeoffs: ['More framework surface than a plain SPA; some server/runtime lock-in.'],
    alternatives: [
      { name: 'Plain React (Vite)', note: 'Simpler SPA when SSR isn’t needed.' },
    ],
    risks: ['Decide rendering strategy (SSR/SSG/ISR) per route deliberately.'],
  },
  react: {
    rationale:
      'React is the most widely adopted UI library with a deep ecosystem and talent pool.',
    tradeoffs: ['You assemble routing/data-fetching from the ecosystem.'],
    alternatives: [
      { name: 'Vue', note: 'Gentler learning curve, smaller ecosystem.' },
      { name: 'Svelte', note: 'Less runtime overhead; smaller community.' },
    ],
    risks: ['Standardize state/data patterns to avoid fragmentation.'],
  },
  bullmq: {
    rationale:
      'BullMQ gives durable, Redis-backed background jobs with retries and scheduling — a natural fit when Redis is already in the stack.',
    tradeoffs: ['Ties the queue to Redis availability and memory.'],
    alternatives: [
      { name: 'RabbitMQ', note: 'Richer routing; a separate broker to operate.' },
      { name: 'Kafka', note: 'High-throughput streaming; heavier to run.' },
    ],
    risks: ['Make jobs idempotent and set sensible retry/backoff.'],
  },
};

// ── helpers ────────────────────────────────────────────────────────────────

function pretty(architecture: string): string {
  return architecture.replace(/_/g, ' ');
}

function normalizeTech(tech: string): string {
  return tech.trim().toLowerCase();
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
