'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
import { apiDesignApi } from '@/lib/api';
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

type Draft = Omit<ApiDesign, 'sessionId' | 'generatedAt'>;

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function validate(d: Draft, t: TFunction): string[] {
  const errs: string[] = [];
  d.modules.forEach((m, mi) => {
    const label = m.name.trim() || t('editor.validate.moduleLabel', { n: mi + 1 });
    if (!m.name.trim()) errs.push(t('editor.validate.moduleName', { n: mi + 1 }));
    if (!m.basePath.trim()) errs.push(t('editor.validate.modulePath', { label }));
    m.endpoints.forEach((ep, ei) => {
      if (!ep.path.trim())
        errs.push(t('editor.validate.endpointPath', { label, n: ei + 1 }));
    });
  });
  return errs;
}

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
  onAutosaved,
}: {
  design: ApiDesign;
  sessionId: string;
  onSaved: (design: ApiDesign) => void;
  onCancel: () => void;
  onDirty?: () => void;
  /** Called after a debounced autosave — persists without closing the editor. */
  onAutosaved?: (design: ApiDesign) => void;
}) {
  const { t } = useTranslation('stages');
  const [draft, setDraft] = useState<Draft>(() => ({ modules: design.modules }));
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
      const result = await apiDesignApi.update(sessionId, draft);
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
              placeholder={t('editor.field.field')}
              dir="ltr"
              onChange={(e) => patch((d) => (pick(d)[fi].name = e.target.value))}
            />
            <Input
              className="w-28 text-xs"
              value={f.type}
              placeholder={t('editor.field.type')}
              dir="ltr"
              onChange={(e) => patch((d) => (pick(d)[fi].type = e.target.value))}
            />
            <Check
              label={t('editor.field.required')}
              checked={f.required}
              onChange={(v) => patch((d) => (pick(d)[fi].required = v))}
            />
            <RemoveButton
              label={t('editor.removeLabel.field')}
              onClick={() => patch((d) => pick(d).splice(fi, 1))}
            />
          </div>
        ))}
        <AddButton
          onClick={() =>
            patch((d) => pick(d).push({ name: '', type: 'string', required: false }))
          }
        >
          {t('editor.add.field')}
        </AddButton>
      </div>
    </div>
  );

  return (
    <div>
      <Section title={t('editor.sections.modules')}>
        <div className="space-y-3">
          {draft.modules.map((module, mi) => (
            <div key={mi} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Input
                  className={`w-48 ${invalidIf(show && !module.name.trim())}`}
                  value={module.name}
                  placeholder={t('editor.field.moduleName')}
                  dir="auto"
                  onChange={(e) => patch((d) => (d.modules[mi].name = e.target.value))}
                />
                <Input
                  className={`font-mono text-xs ${invalidIf(show && !module.basePath.trim())}`}
                  value={module.basePath}
                  placeholder="/api/users"
                  dir="ltr"
                  onChange={(e) =>
                    patch((d) => (d.modules[mi].basePath = e.target.value))
                  }
                />
                <RemoveButton
                  label={t('editor.removeLabel.module')}
                  onClick={() => patch((d) => d.modules.splice(mi, 1))}
                />
              </div>

              <Label className="mt-3 block text-xs text-muted-foreground">
                {t('editor.field.endpoints')}
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
                        className={`w-56 font-mono text-xs ${invalidIf(show && !ep.path.trim())}`}
                        value={ep.path}
                        placeholder="/api/users/:id"
                        dir="ltr"
                        onChange={(e) =>
                          patch((d) => (d.modules[mi].endpoints[ei].path = e.target.value))
                        }
                      />
                      <RemoveButton
                        label={t('editor.removeLabel.endpoint')}
                        onClick={() =>
                          patch((d) => d.modules[mi].endpoints.splice(ei, 1))
                        }
                      />
                    </div>
                    <Input
                      className="mt-2"
                      value={ep.summary}
                      placeholder={t('editor.field.summary')}
                      dir="auto"
                      onChange={(e) =>
                        patch((d) => (d.modules[mi].endpoints[ei].summary = e.target.value))
                      }
                    />
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      {schemaEditor(
                        t('api.request'),
                        ep.requestSchema,
                        (d) => d.modules[mi].endpoints[ei].requestSchema,
                      )}
                      {schemaEditor(
                        t('api.response'),
                        ep.responseSchema,
                        (d) => d.modules[mi].endpoints[ei].responseSchema,
                      )}
                    </div>
                    <Label className="mt-2 block text-xs text-muted-foreground">
                      {t('editor.field.statusCodes')}
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
                  {t('editor.add.endpoint')}
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
            {t('editor.add.module')}
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
