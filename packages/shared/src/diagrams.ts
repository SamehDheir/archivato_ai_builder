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

export interface ProjectDiagrams {
  sessionId: string;
  generatedAt: string;
  diagrams: Diagram[];
}
