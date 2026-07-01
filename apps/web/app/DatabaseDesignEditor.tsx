'use client';

import { useState } from 'react';
import {
  COMMON_COLUMN_TYPES,
  type DatabaseDesign,
  type RelationType,
} from '@archivato/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { databaseDesignApi } from '../lib/api';
import { Section } from './RequirementDocumentView';
import { AddButton, Check, EditorBar, RemoveButton } from './editor-kit';

type Draft = Omit<DatabaseDesign, 'sessionId' | 'generatedAt'>;

/** Shared datalist id for column-type suggestions. */
const COLUMN_TYPE_LIST = 'archivato-column-types';

const RELATION_TYPES: RelationType[] = [
  'one-to-one',
  'one-to-many',
  'many-to-many',
];

export function DatabaseDesignEditor({
  design,
  sessionId,
  onSaved,
  onCancel,
  onDirty,
}: {
  design: DatabaseDesign;
  sessionId: string;
  onSaved: (design: DatabaseDesign) => void;
  onCancel: () => void;
  onDirty?: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => ({
    databaseType: design.databaseType,
    entities: design.entities,
    relations: design.relations,
  }));
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
      onSaved(await databaseDesignApi.update(sessionId, draft));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <datalist id={COLUMN_TYPE_LIST}>
        {COMMON_COLUMN_TYPES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <Section title="Database">
        <Input
          className="w-56"
          value={draft.databaseType}
          placeholder="PostgreSQL"
          onChange={(e) => patch((d) => (d.databaseType = e.target.value))}
        />
      </Section>

      <Section title="Entities">
        <div className="space-y-3">
          {draft.entities.map((entity, ei) => (
            <div key={ei} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Input
                  className="w-48 font-mono text-sm"
                  value={entity.name}
                  placeholder="table_name"
                  onChange={(e) =>
                    patch((d) => (d.entities[ei].name = e.target.value))
                  }
                />
                <Input
                  value={entity.description}
                  placeholder="Description"
                  onChange={(e) =>
                    patch((d) => (d.entities[ei].description = e.target.value))
                  }
                />
                <RemoveButton
                  label="Remove entity"
                  onClick={() => patch((d) => d.entities.splice(ei, 1))}
                />
              </div>

              <Label className="mt-3 block text-xs text-muted-foreground">
                Columns
              </Label>
              <div className="mt-1 space-y-2">
                {entity.columns.map((col, ci) => (
                  <div
                    key={ci}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-muted/20 p-2"
                  >
                    <Input
                      className="w-36 font-mono text-xs"
                      value={col.name}
                      placeholder="column"
                      onChange={(e) =>
                        patch((d) => (d.entities[ei].columns[ci].name = e.target.value))
                      }
                    />
                    <Input
                      list={COLUMN_TYPE_LIST}
                      className="w-36 font-mono text-xs"
                      value={col.type}
                      placeholder="type"
                      onChange={(e) =>
                        patch(
                          (d) => (d.entities[ei].columns[ci].type = e.target.value),
                        )
                      }
                    />
                    <Check
                      label="nullable"
                      checked={col.nullable}
                      onChange={(v) =>
                        patch((d) => (d.entities[ei].columns[ci].nullable = v))
                      }
                    />
                    <Check
                      label="PK"
                      checked={!!col.primaryKey}
                      onChange={(v) =>
                        patch((d) => (d.entities[ei].columns[ci].primaryKey = v))
                      }
                    />
                    <Check
                      label="unique"
                      checked={!!col.unique}
                      onChange={(v) =>
                        patch((d) => (d.entities[ei].columns[ci].unique = v))
                      }
                    />
                    <Input
                      className="w-28 text-xs"
                      defaultValue={col.references?.entity ?? ''}
                      placeholder="FK → entity"
                      onChange={(e) =>
                        patch((d) => {
                          const c = d.entities[ei].columns[ci];
                          const entityName = e.target.value.trim();
                          c.references = entityName
                            ? {
                                entity: entityName,
                                column: c.references?.column || 'id',
                              }
                            : undefined;
                        })
                      }
                    />
                    <Input
                      className="w-24 text-xs"
                      defaultValue={col.references?.column ?? ''}
                      placeholder="FK column"
                      onChange={(e) =>
                        patch((d) => {
                          const c = d.entities[ei].columns[ci];
                          if (c.references) c.references.column = e.target.value.trim();
                        })
                      }
                    />
                    <RemoveButton
                      label="Remove column"
                      onClick={() =>
                        patch((d) => d.entities[ei].columns.splice(ci, 1))
                      }
                    />
                  </div>
                ))}
                <AddButton
                  onClick={() =>
                    patch((d) =>
                      d.entities[ei].columns.push({
                        name: '',
                        type: 'string',
                        nullable: false,
                      }),
                    )
                  }
                >
                  Add column
                </AddButton>
              </div>
            </div>
          ))}
          <AddButton
            onClick={() =>
              patch((d) =>
                d.entities.push({ name: '', description: '', columns: [] }),
              )
            }
          >
            Add entity
          </AddButton>
        </div>
      </Section>

      <Section title="Relations">
        <div className="space-y-2">
          {draft.relations.map((rel, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input
                className="w-36 font-mono text-xs"
                value={rel.from}
                placeholder="from"
                onChange={(e) => patch((d) => (d.relations[i].from = e.target.value))}
              />
              <Select
                value={rel.type}
                onValueChange={(v) =>
                  patch((d) => (d.relations[i].type = v as RelationType))
                }
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RELATION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="w-36 font-mono text-xs"
                value={rel.to}
                placeholder="to"
                onChange={(e) => patch((d) => (d.relations[i].to = e.target.value))}
              />
              <Input
                value={rel.description ?? ''}
                placeholder="description (optional)"
                onChange={(e) =>
                  patch((d) => (d.relations[i].description = e.target.value))
                }
              />
              <RemoveButton onClick={() => patch((d) => d.relations.splice(i, 1))} />
            </div>
          ))}
          <AddButton
            onClick={() =>
              patch((d) =>
                d.relations.push({ from: '', to: '', type: 'one-to-many' }),
              )
            }
          >
            Add relation
          </AddButton>
        </div>
      </Section>

      <EditorBar saving={saving} error={error} onSave={save} onCancel={onCancel} />
    </div>
  );
}
