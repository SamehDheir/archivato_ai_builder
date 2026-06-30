'use client';

import { useCallback, useMemo, useState } from 'react';
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { SystemDesign } from '@archivato/shared';
import { Button } from '@/components/ui/button';
import { systemDesignApi } from '../lib/api';
import {
  gridPosition,
  loadPositions,
  savePositions,
  type PositionMap,
} from '../lib/canvas-storage';

type SvcData = { name: string; responsibility: string };

/** A draggable service box with an editable name + responsibility. */
function ServiceNode({ id, data }: NodeProps<SvcData>) {
  const { setNodes } = useReactFlow();
  const update = (field: keyof SvcData, value: string) =>
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, [field]: value } } : n,
      ),
    );
  return (
    <div className="min-w-[180px] rounded-lg border border-primary/50 bg-card shadow-sm">
      <Handle type="target" position={Position.Left} className="!bg-primary" />
      <div className="border-b border-border px-2 py-1.5">
        <input
          className="nodrag w-full bg-transparent text-sm font-semibold outline-none"
          value={data.name}
          placeholder="Service name"
          onChange={(e) => update('name', e.target.value)}
        />
      </div>
      <input
        className="nodrag w-full bg-transparent px-2 py-1.5 text-xs text-muted-foreground outline-none"
        value={data.responsibility}
        placeholder="Responsibility"
        onChange={(e) => update('responsibility', e.target.value)}
      />
      <Handle type="source" position={Position.Right} className="!bg-primary" />
    </div>
  );
}

function buildGraph(
  design: SystemDesign,
  positions: PositionMap,
): { nodes: Node<SvcData>[]; edges: Edge[] } {
  const nameToId = new Map<string, string>();
  const nodes: Node<SvcData>[] = design.services.map((s, i) => {
    const nodeId = `svc-${i}`;
    nameToId.set(s.name, nodeId);
    return {
      id: nodeId,
      type: 'service',
      position: positions[s.name] ?? gridPosition(i),
      data: { name: s.name, responsibility: s.responsibility },
    };
  });

  const edges: Edge[] = [];
  design.services.forEach((s, i) => {
    for (const dep of s.dependencies) {
      const target = nameToId.get(dep);
      if (target) {
        edges.push({
          id: `e-svc-${i}-${target}`,
          source: `svc-${i}`,
          target,
          markerEnd: { type: MarkerType.ArrowClosed },
        });
      }
    }
  });
  return { nodes, edges };
}

const nodeTypes = { service: ServiceNode };

export function ArchitectureCanvas({
  design,
  sessionId,
  onSaved,
}: {
  design: SystemDesign;
  sessionId: string;
  onSaved: (design: SystemDesign) => void;
}) {
  const initial = useMemo(
    () => buildGraph(design, loadPositions(sessionId, 'architecture')),
    // Rebuild only when the artifact identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [design],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addCount, setAddCount] = useState(0);

  const onConnect = useCallback(
    (c: Connection) =>
      setEdges((eds) =>
        addEdge({ ...c, markerEnd: { type: MarkerType.ArrowClosed } }, eds),
      ),
    [setEdges],
  );

  /** Persist the dragged layout (keyed by service name). */
  const persistLayout = useCallback(
    (current: Node<SvcData>[]) => {
      const map: PositionMap = {};
      for (const n of current) map[n.data.name] = n.position;
      savePositions(sessionId, 'architecture', map);
    },
    [sessionId],
  );

  function addService() {
    const n = addCount + 1;
    setAddCount(n);
    setNodes((nds) => [
      ...nds,
      {
        id: `svc-new-${n}`,
        type: 'service',
        position: { x: 60 + n * 24, y: 60 + n * 24 },
        data: { name: `New Service ${n}`, responsibility: '' },
      },
    ]);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const idToName = new Map(nodes.map((n) => [n.id, n.data.name.trim()]));
      const services = nodes.map((n) => ({
        name: n.data.name.trim(),
        responsibility: n.data.responsibility.trim(),
        dependencies: edges
          .filter((e) => e.source === n.id)
          .map((e) => idToName.get(e.target) ?? '')
          .filter(Boolean),
      }));
      const saved = await systemDesignApi.update(sessionId, {
        architecture: design.architecture,
        architectureRationale: design.architectureRationale,
        techStack: design.techStack,
        services,
      });
      persistLayout(nodes);
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={addService}>
          + Add service
        </Button>
        <span className="text-xs text-muted-foreground">
          Drag to arrange · drag a node’s right dot to another to add a dependency
          · select + Delete to remove
        </span>
        <span className="ml-auto" />
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save architecture'}
        </Button>
      </div>
      {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
      <div className="h-[560px] rounded-md border border-border bg-muted/10">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={() =>
            setNodes((nds) => {
              persistLayout(nds);
              return nds;
            })
          }
          nodeTypes={nodeTypes}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
