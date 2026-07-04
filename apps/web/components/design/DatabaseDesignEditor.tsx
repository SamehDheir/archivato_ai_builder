'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
import { databaseDesignApi } from '@/lib/api';
import { Section } from '@/components/design/RequirementDocumentView';
import {
  AddButton,
  Check,
  EditorBar,
  RemoveButton,
  ValidationSummary,
  invalidIf,
  useEscapeKey,
} from '@/components/shared/editor-kit';

type Draft = Omit<DatabaseDesign, 'sessionId' | 'generatedAt'>;

/** Shared datalist id for column-type suggestions. */
const COLUMN_TYPE_LIST = 'archivato-column-types';

const RELATION_TYPES: RelationType[] = [
  'one-to-one',
  'one-to-many',
  'many-to-many',
];

function validate(d: Draft, t: TFunction): string[] {
  const errs: string[] = [];
  if (!d.databaseType.trim()) errs.push(t('editor.validate.dbType'));
  d.entities.forEach((entity, ei) => {
    const label =
      entity.name.trim() || t('editor.validate.entityLabel', { n: ei + 1 });
    if (!entity.name.trim()) errs.push(t('editor.validate.entityName', { n: ei + 1 }));
    if (entity.columns.length === 0)
      errs.push(t('editor.validate.entityColumns', { label }));
    entity.columns.forEach((col, ci) => {
      if (!col.name.trim())
        errs.push(t('editor.validate.colName', { label, n: ci + 1 }));
      if (!col.type.trim())
        errs.push(
          t('editor.validate.colType', { label, ref: col.name.trim() || ci + 1 }),
        );
    });
  });
  d.relations.forEach((rel, i) => {
    if (!rel.from.trim() || !rel.to.trim())
      errs.push(t('editor.validate.relationEnds', { n: i + 1 }));
  });
  return errs;
}

export function DatabaseDesignEditor({
  design,
  sessionId,
  onSaved,
  onCancel,
  onDirty,
  onAutosaved,
}: {
  design: DatabaseDesign;
  sessionId: string;
  onSaved: (design: DatabaseDesign) => void;
  onCancel: () => void;
  onDirty?: () => void;
  /** Called after a debounced autosave — persists without closing the editor. */
  onAutosaved?: (design: DatabaseDesign) => void;
}) {
  const { t } = useTranslation('stages');
  const [draft, setDraft] = useState<Draft>(() => ({
    databaseType: design.databaseType,
    entities: design.entities,
    relations: design.relations,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [attempted, setAttempted] = useState(false);

  const errors = validate(draft, t);
  const show = attempted;

  useEscapeKey(() => {
    if (!saving) onCancel();
  });

  const patch = (fn: (d: Draft) => void) => {
    onDirty?.();
    setDirty(true);
    setDraft((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  };

  async function save(auto = false) {
    if (!auto) setAttempted(true);
    if (errors.length > 0) return;
    setSaving(true);
    setError(null);
    try {
      const result = await databaseDesignApi.update(sessionId, draft);
      setDirty(false);
      setSavedAt(Date.now());
      if (auto) onAutosaved?.(result);
      else onSaved(result);
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

      <Section title={t('editor.sections.database')}>
        <Input
          className={`w-56 ${invalidIf(show && !draft.databaseType.trim())}`}
          value={draft.databaseType}
          placeholder="PostgreSQL"
          dir="ltr"
          onChange={(e) => patch((d) => (d.databaseType = e.target.value))}
        />
      </Section>

      <Section title={t('editor.sections.entities')}>
        <div className="space-y-3">
          {draft.entities.map((entity, ei) => (
            <div key={ei} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Input
                  className={`w-48 font-mono text-sm ${invalidIf(show && !entity.name.trim())}`}
                  value={entity.name}
                  placeholder={t('editor.field.tableName')}
                  dir="ltr"
                  onChange={(e) =>
                    patch((d) => (d.entities[ei].name = e.target.value))
                  }
                />
                <Input
                  value={entity.description}
                  placeholder={t('editor.field.description')}
                  dir="auto"
                  onChange={(e) =>
                    patch((d) => (d.entities[ei].description = e.target.value))
                  }
                />
                <RemoveButton
                  label={t('editor.removeLabel.entity')}
                  onClick={() => patch((d) => d.entities.splice(ei, 1))}
                />
              </div>

              <Label className="mt-3 block text-xs text-muted-foreground">
                {t('editor.field.columns')}
              </Label>
              <div className="mt-1 space-y-2">
                {entity.columns.map((col, ci) => (
                  <div
                    key={ci}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-muted/20 p-2"
                  >
                    <Input
                      className={`w-36 font-mono text-xs ${invalidIf(show && !col.name.trim())}`}
                      value={col.name}
                      placeholder={t('editor.field.column')}
                      dir="ltr"
                      onChange={(e) =>
                        patch((d) => (d.entities[ei].columns[ci].name = e.target.value))
                      }
                    />
                    <Input
                      list={COLUMN_TYPE_LIST}
                      className={`w-36 font-mono text-xs ${invalidIf(show && !col.type.trim())}`}
                      value={col.type}
                      placeholder={t('editor.field.type')}
                      dir="ltr"
                      onChange={(e) =>
                        patch(
                          (d) => (d.entities[ei].columns[ci].type = e.target.value),
                        )
                      }
                    />
                    <Check
                      label={t('editor.field.nullable')}
                      checked={col.nullable}
                      onChange={(v) =>
                        patch((d) => (d.entities[ei].columns[ci].nullable = v))
                      }
                    />
                    <Check
                      label={t('editor.field.pk')}
                      checked={!!col.primaryKey}
                      onChange={(v) =>
                        patch((d) => (d.entities[ei].columns[ci].primaryKey = v))
                      }
                    />
                    <Check
                      label={t('editor.field.unique')}
                      checked={!!col.unique}
                      onChange={(v) =>
                        patch((d) => (d.entities[ei].columns[ci].unique = v))
                      }
                    />
                    <Input
                      className="w-28 text-xs"
                      defaultValue={col.references?.entity ?? ''}
                      placeholder={t('editor.field.fkEntity')}
                      dir="ltr"
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
                      placeholder={t('editor.field.fkColumn')}
                      dir="ltr"
                      onChange={(e) =>
                        patch((d) => {
                          const c = d.entities[ei].columns[ci];
                          if (c.references) c.references.column = e.target.value.trim();
                        })
                      }
                    />
                    <RemoveButton
                      label={t('editor.removeLabel.column')}
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
                  {t('editor.add.column')}
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
            {t('editor.add.entity')}
          </AddButton>
        </div>
      </Section>

      <Section title={t('editor.sections.relations')}>
        <div className="space-y-2">
          {draft.relations.map((rel, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input
                className={`w-36 font-mono text-xs ${invalidIf(show && !rel.from.trim())}`}
                value={rel.from}
                placeholder={t('editor.field.from')}
                dir="ltr"
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
                className={`w-36 font-mono text-xs ${invalidIf(show && !rel.to.trim())}`}
                value={rel.to}
                placeholder={t('editor.field.to')}
                dir="ltr"
                onChange={(e) => patch((d) => (d.relations[i].to = e.target.value))}
              />
              <Input
                value={rel.description ?? ''}
                placeholder={t('editor.field.descriptionOptional')}
                dir="auto"
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
            {t('editor.add.relation')}
          </AddButton>
        </div>
      </Section>

      {show && <ValidationSummary errors={errors} />}
      <EditorBar
        saving={saving}
        error={error}
        dirty={dirty}
        canSave={errors.length === 0}
        savedAt={savedAt}
        onSave={() => save()}
        onAutosave={() => save(true)}
        onCancel={onCancel}
      />
    </div>
  );
}
