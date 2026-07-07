"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import type { Diagram, ProjectDiagrams, SequenceFlow } from "@archivato/shared";
import { diagramsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { MermaidView } from "@/components/design/MermaidView";

/**
 * Architecture diagrams: fetches the project's Mermaid source set and renders
 * the selected one to SVG in the browser (mermaid.js). Falls back to showing
 * the source if a diagram fails to render.
 */
export function DiagramsView({
  sessionId,
  reloadKey,
}: {
  sessionId: string;
  reloadKey: number;
}) {
  const { t } = useTranslation("stages");
  const [data, setData] = useState<ProjectDiagrams | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [flowId, setFlowId] = useState<string>("overview");
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await diagramsApi.get(sessionId);
      setData(res);
      setKind(
        (prev) =>
          prev ??
          res.diagrams.find((d) => d.mermaid)?.kind ??
          res.diagrams[0]?.kind ??
          null,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data)
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-[26rem] w-full" />
      </div>
    );

  const active: Diagram | undefined =
    data.diagrams.find((d) => d.kind === kind) ?? data.diagrams[0];

  const flows: SequenceFlow[] = data.flows ?? [];
  const showFlows = active?.kind === "sequence" && flows.length > 0;
  const activeFlow = showFlows
    ? flows.find((f) => f.id === flowId)
    : undefined;
  // On the sequence tab, "overview" keeps the generic happy-path diagram; any
  // other selection renders that endpoint's dedicated flow.
  const renderMermaid = activeFlow ? activeFlow.mermaid : active?.mermaid ?? "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={active?.kind} onValueChange={(v) => setKind(v)}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder={t("diagrams.choose")} />
          </SelectTrigger>
          <SelectContent>
            {data.diagrams.map((d) => (
              <SelectItem key={d.kind} value={d.kind}>
                <span className="flex items-center gap-1.5 w-full">
                  <span dir="auto">{d.title}</span>
                  {!d.mermaid && (
                    <Lock
                      className="h-3 w-3 text-muted-foreground shrink-0"
                      aria-label={t("diagrams.pro")}
                    />
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {showFlows && <FlowPicker flows={flows} value={flowId} onChange={setFlowId} />}

        {renderMermaid && (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowSource((s) => !s)}
            >
              {showSource ? t("diagrams.showDiagram") : t("diagrams.viewSource")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigator.clipboard?.writeText(renderMermaid)}
            >
              {t("diagrams.copyMermaid")}
            </Button>
          </>
        )}
      </div>

      {showFlows && (
        <p className="text-xs text-muted-foreground" dir="auto">
          {t("diagrams.flowsHint")}
        </p>
      )}

      {active && !active.mermaid && (
        <p className="text-sm text-muted-foreground" dir="auto">
          {active.note}
        </p>
      )}

      {renderMermaid &&
        (showSource ? (
          <pre
            dir="ltr"
            className="max-h-[28rem] overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs"
          >
            {renderMermaid}
          </pre>
        ) : (
          <MermaidView code={renderMermaid} />
        ))}
    </div>
  );
}

/** The per-flow sub-picker shown when the Sequence diagram is active. */
function FlowPicker({
  flows,
  value,
  onChange,
}: {
  flows: SequenceFlow[];
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation("stages");
  // Group flows by their owning module for a scannable dropdown.
  const groups = useMemo(() => {
    const map = new Map<string, SequenceFlow[]>();
    for (const f of flows) {
      const list = map.get(f.group) ?? [];
      list.push(f);
      map.set(f.group, list);
    }
    return Array.from(map.entries());
  }, [flows]);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-72">
        <SelectValue placeholder={t("diagrams.chooseFlow")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="overview">{t("diagrams.overview")}</SelectItem>
        {groups.map(([group, items]) => (
          <SelectGroup key={group}>
            <SelectLabel dir="auto">{group}</SelectLabel>
            {items.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                <span dir="auto" className="font-mono text-xs">
                  {f.method} {f.path}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}