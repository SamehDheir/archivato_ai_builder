'use client';

import { useState } from 'react';
import type { ApiDesign, HttpMethod, SchemaField } from '@archivato/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiDesignApi } from '../lib/api';
import { Section } from './RequirementDocumentView';
import { AddButton, Check, EditorBar, RemoveButton } from './editor-kit';

type Draft = Omit<ApiDesign, 'sessionId' | 'generatedAt'>;

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** Parse a comma list of status codes into a numeric array (drops non-numbers). */
function parseCodes(value: string): number[] {
  return value
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));
}

export function ApiDesignEditor({
  design,
  sessionId,
  onSaved,
  onCancel,
  onDirty,
}: {
  design: ApiDesign;
  sessionId: string;
  onSaved: (design: ApiDesign) => void;
  onCancel: () => void;
  onDirty?: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => ({ modules: design.modules }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (fn: (d: Draft) => void) => {
    onDirty?.();
    setDraft((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      onSaved(await apiDesignApi.update(sessionId, draft));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  /** Editor for one request/response schema (a list of fields). */
  const schemaEditor = (
    label: string,
    fields: SchemaField[],
    pick: (d: Draft) => SchemaField[],
  ) => (
    <div>
      <Label className="block text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1 space-y-1.5">
        {fields.map((f, fi) => (
          <div key={fi} className="flex items-center gap-2">
            <Input
              className="w-32 font-mono text-xs"
              value={f.name}
              placeholder="field"
              onChange={(e) => patch((d) => (pick(d)[fi].name = e.target.value))}
            />
            <Input
              className="w-28 text-xs"
              value={f.type}
              placeholder="type"
              onChange={(e) => patch((d) => (pick(d)[fi].type = e.target.value))}
            />
            <Check
              label="required"
              checked={f.required}
              onChange={(v) => patch((d) => (pick(d)[fi].required = v))}
            />
            <RemoveButton
              label="Remove field"
              onClick={() => patch((d) => pick(d).splice(fi, 1))}
            />
          </div>
        ))}
        <AddButton
          onClick={() =>
            patch((d) => pick(d).push({ name: '', type: 'string', required: false }))
          }
        >
          Add field
        </AddButton>
      </div>
    </div>
  );

  return (
    <div>
      <Section title="Modules">
        <div className="space-y-3">
          {draft.modules.map((module, mi) => (
            <div key={mi} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Input
                  className="w-48"
                  value={module.name}
                  placeholder="Module name"
                  onChange={(e) => patch((d) => (d.modules[mi].name = e.target.value))}
                />
                <Input
                  className="font-mono text-xs"
                  value={module.basePath}
                  placeholder="/api/users"
                  onChange={(e) =>
                    patch((d) => (d.modules[mi].basePath = e.target.value))
                  }
                />
                <RemoveButton
                  label="Remove module"
                  onClick={() => patch((d) => d.modules.splice(mi, 1))}
                />
              </div>

              <Label className="mt-3 block text-xs text-muted-foreground">
                Endpoints
              </Label>
              <div className="mt-1 space-y-2">
                {module.endpoints.map((ep, ei) => (
                  <div
                    key={ei}
                    className="rounded-md border border-border/60 bg-muted/20 p-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={ep.method}
                        onValueChange={(v) =>
                          patch(
                            (d) =>
                              (d.modules[mi].endpoints[ei].method = v as HttpMethod),
                          )
                        }
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {METHODS.map((m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        className="w-56 font-mono text-xs"
                        value={ep.path}
                        placeholder="/api/users/:id"
                        onChange={(e) =>
                          patch((d) => (d.modules[mi].endpoints[ei].path = e.target.value))
                        }
                      />
                      <RemoveButton
                        label="Remove endpoint"
                        onClick={() =>
                          patch((d) => d.modules[mi].endpoints.splice(ei, 1))
                        }
                      />
                    </div>
                    <Input
                      className="mt-2"
                      value={ep.summary}
                      placeholder="Summary"
                      onChange={(e) =>
                        patch((d) => (d.modules[mi].endpoints[ei].summary = e.target.value))
                      }
                    />
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      {schemaEditor(
                        'Request',
                        ep.requestSchema,
                        (d) => d.modules[mi].endpoints[ei].requestSchema,
                      )}
                      {schemaEditor(
                        'Response',
                        ep.responseSchema,
                        (d) => d.modules[mi].endpoints[ei].responseSchema,
                      )}
                    </div>
                    <Label className="mt-2 block text-xs text-muted-foreground">
                      Status codes (comma-separated)
                    </Label>
                    <Input
                      className="mt-1 w-56 font-mono text-xs"
                      defaultValue={ep.statusCodes.join(', ')}
                      placeholder="200, 404"
                      onChange={(e) =>
                        patch(
                          (d) =>
                            (d.modules[mi].endpoints[ei].statusCodes = parseCodes(
                              e.target.value,
                            )),
                        )
                      }
                    />
                  </div>
                ))}
                <AddButton
                  onClick={() =>
                    patch((d) =>
                      d.modules[mi].endpoints.push({
                        method: 'GET',
                        path: '',
                        summary: '',
                        requestSchema: [],
                        responseSchema: [],
                        statusCodes: [200],
                      }),
                    )
                  }
                >
                  Add endpoint
                </AddButton>
              </div>
            </div>
          ))}
          <AddButton
            onClick={() =>
              patch((d) =>
                d.modules.push({ name: '', basePath: '', endpoints: [] }),
              )
            }
          >
            Add module
          </AddButton>
        </div>
      </Section>

      <EditorBar saving={saving} error={error} onSave={save} onCancel={onCancel} />
    </div>
  );
}
