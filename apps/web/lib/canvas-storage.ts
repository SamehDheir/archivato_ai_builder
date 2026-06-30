/**
 * Per-project canvas layout persistence (browser-only). Node positions are
 * keyed by the node's NAME (the stable identifier we have in the artifact, which
 * has no ids), so a layout survives reloads on the same browser. Structure
 * (services/entities/edges) is persisted server-side via the PUT endpoints.
 */

export type CanvasKind = 'architecture' | 'database';
export type NodePosition = { x: number; y: number };
export type PositionMap = Record<string, NodePosition>;

const key = (sessionId: string, kind: CanvasKind) =>
  `archivato.canvas.${kind}.${sessionId}`;

export function loadPositions(sessionId: string, kind: CanvasKind): PositionMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(key(sessionId, kind));
    return raw ? (JSON.parse(raw) as PositionMap) : {};
  } catch {
    return {};
  }
}

export function savePositions(
  sessionId: string,
  kind: CanvasKind,
  positions: PositionMap,
): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key(sessionId, kind), JSON.stringify(positions));
  } catch {
    /* quota / disabled storage — non-fatal, layout just won't persist */
  }
}

/** A tidy fallback position for the i-th node (4-column grid). */
export function gridPosition(i: number): NodePosition {
  return { x: (i % 4) * 240, y: Math.floor(i / 4) * 170 };
}
