/**
 * Architecture diagrams. The structured design artifacts are turned into
 * **Mermaid** source by deterministic builders (see the API's `diagrams`
 * module) and rendered to SVG in the browser. Keep this file runtime-free.
 */

export type DiagramKind =
  | 'flowchart'
  | 'sequence'
  | 'class'
  | 'erd'
  | 'microservices'
  | 'deployment';

/** The fixed display order + labels for the diagram set. */
export const DIAGRAM_KINDS: readonly { kind: DiagramKind; title: string }[] = [
  { kind: 'flowchart', title: 'Flow Chart' },
  { kind: 'sequence', title: 'Sequence Diagram' },
  { kind: 'class', title: 'Class Diagram' },
  { kind: 'erd', title: 'Entity-Relationship (ERD)' },
  { kind: 'microservices', title: 'Microservices / Components' },
  { kind: 'deployment', title: 'Deployment Diagram' },
] as const;

export interface Diagram {
  kind: DiagramKind;
  title: string;
  /** Mermaid source (empty when the prerequisite artifact is missing). */
  mermaid: string;
  /** Set when the diagram can't be built yet (e.g. "Generate the … first"). */
  note?: string;
}

/**
 * A single user/request flow rendered as its own sequence diagram. Unlike the
 * generic `sequence` {@link Diagram} (one representative happy path), flows are
 * generated **per API endpoint** so every meaningful interaction has its own
 * diagram, grouped by module. Deterministic (no LLM), built from the API +
 * system design.
 */
export interface SequenceFlow {
  /** Stable id (module + method + path), safe to use as a React key. */
  id: string;
  /** The owning module name, used to group flows in the picker. */
  group: string;
  /** Human label, e.g. "POST /api/billing — create invoice". */
  title: string;
  method: string;
  path: string;
  /** Mermaid `sequenceDiagram` source. */
  mermaid: string;
}

export interface ProjectDiagrams {
  sessionId: string;
  generatedAt: string;
  diagrams: Diagram[];
  /**
   * Per-flow sequence diagrams (one per endpoint). Empty until the API design
   * exists; the generic `sequence` diagram in {@link diagrams} stays as an
   * overview.
   */
  flows: SequenceFlow[];
}
