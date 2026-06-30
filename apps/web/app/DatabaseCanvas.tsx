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
import type { DatabaseDesign, Entity, RelationType } from '@archivato/shared';
import { Button } from '@/components/ui/button';
import { databaseDesignApi } from '../lib/api';
import {
  gridPosition,
  loadPositions,
  savePositions,
  type PositionMap,
} from '../lib/canvas-storage';

/** Each node carries the full Entity (so columns survive the round-trip) + its
 * editable display name. */
type EntityData = { name: string; entity: Entity };

const RELATION_CYCLE: RelationType[] = [
  'one-to-many',
  'one-to-one',
  'many-to-many',
];

/** A draggable entity box: editable name + a read-only column preview. */
function EntityNode({ id, data }: NodeProps<EntityData>) {
  const { setNodes } = useReactFlow();
  const rename = (value: string) =>
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, name: value } } : n)),
    );
  return (
    <div className="min-w-[180px] rounded-lg border border-border bg-card shadow-sm">
      <Handle type="target" position={Position.Left} className="!bg-primary" />
      <div className="border-b border-border px-2 py-1.5">
        <input
          className="nodrag w-full bg-transparent font-mono text-sm font-semibold outline-none"
          value={data.name}
          placeholder="table_name"
          onChange={(e) => rename(e.target.value)}
        />
      </div>
      <ul className="max-h-32 overflow-auto px-2 py-1.5 text-xs text-muted-foreground">
        {data.entity.columns.length ? (
          data.entity.columns.slice(0, 8).map((c) => (
            <li key={c.name} className="flex justify-between gap-2">
              <span className="font-mono">{c.name}</span>
              <span>
                {c.primaryKey ? 'PK ' : ''}
                {c.references ? 'FK ' : ''}
                {c.type}
              </span>
            </li>
          ))
        ) : (
          <li className="italic">no columns (edit in the form)</li>
        )}
      </ul>
      <Handle type="source" position={Position.Right} className="!bg-primary" />
    </div>
  );
}

function buildGraph(
  design: DatabaseDesign,
  positions: PositionMap,
): { nodes: Node<EntityData>[]; edges: Edge[] } {
  const nameToId = new Map<string, string>();
  const nodes: Node<EntityData>[] = design.entities.map((entity, i) => {
    const nodeId = `ent-${i}`;
    nameToId.set(entity.name, nodeId);
    return {
      id: nodeId,
      type: 'entity',
      position: positions[entity.name] ?? gridPosition(i),
      data: { name: entity.name, entity },
    };
  });

  const edges: Edge[] = design.relations.flatMap((rel, i) => {
    const source = nameToId.get(rel.from);
    const target = nameToId.get(rel.to);
    if (!source || !target) return [];
    return [
      {
        id: `rel-${i}`,
        source,
        target,
        label: rel.type,
        data: { type: rel.type, description: rel.description },
        markerEnd: { type: MarkerType.ArrowClosed },
      } as Edge,
    ];
  });
  return { nodes, edges };
}

const nodeTypes = { entity: EntityNode };

export function DatabaseCanvas({
  design,
  sessionId,
  onSaved,
}: {
  design: DatabaseDesign;
  sessionId: string;
  onSaved: (design: DatabaseDesign) => void;
}) {
  const initial = useMemo(
    () => buildGraph(design, loadPositions(sessionId, 'database')),
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
        addEdge(
          {
            ...c,
            label: 'one-to-many',
            data: { type: 'one-to-many' as RelationType },
            markerEnd: { type: MarkerType.ArrowClosed },
          },
          eds,
        ),
      ),
    [setEdges],
  );

  /** Click a relation to cycle its type (one-to-many → one-to-one → many…). */
  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) =>
      setEdges((eds) =>
        eds.map((e) => {
          if (e.id !== edge.id) return e;
          const cur = (e.data?.type as RelationType) ?? 'one-to-many';
          const next =
            RELATION_CYCLE[(RELATION_CYCLE.indexOf(cur) + 1) % RELATION_CYCLE.length];
          return { ...e, label: next, data: { ...e.data, type: next } };
        }),
      ),
    [setEdges],
  );

  const persistLayout = useCallback(
    (current: Node<EntityData>[]) => {
      const map: PositionMap = {};
      for (const n of current) map[n.data.name] = n.position;
      savePositions(sessionId, 'database', map);
    },
    [sessionId],
  );

  function addEntity() {
    const n = addCount + 1;
    setAddCount(n);
    const name = `new_table_${n}`;
    setNodes((nds) => [
      ...nds,
      {
        id: `ent-new-${n}`,
        type: 'entity',
        position: { x: 60 + n * 24, y: 60 + n * 24 },
        data: {
          name,
          entity: {
            name,
            description: '',
            columns: [
              { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
            ],
          },
        },
      },
    ]);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const idToName = new Map(nodes.map((n) => [n.id, n.data.name.trim()]));
      const entities: Entity[] = nodes.map((n) => ({
        ...n.data.entity,
        name: n.data.name.trim(),
      }));
      const relations = edges.map((e) => ({
        from: idToName.get(e.source) ?? '',
        to: idToName.get(e.target) ?? '',
        type: (e.data?.type as RelationType) ?? 'one-to-many',
        ...(e.data?.description ? { description: e.data.description } : {}),
      }));
      const saved = await databaseDesignApi.update(sessionId, {
        databaseType: design.databaseType,
        entities,
        relations,
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
        <Button size="sm" variant="secondary" onClick={addEntity}>
          + Add entity
        </Button>
        <span className="text-xs text-muted-foreground">
          Drag to arrange · connect dots to add a relation · click a relation to
          change its type · select + Delete to remove
        </span>
        <span className="ml-auto" />
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save database'}
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
          onEdgeClick={onEdgeClick}
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
