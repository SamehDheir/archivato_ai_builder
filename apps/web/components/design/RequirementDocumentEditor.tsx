'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { RequirementDocument, RequirementPriority } from '@archivato/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { requirementsApi } from '@/lib/api';
import { Section } from '@/components/design/RequirementDocumentView';
import {
  AddButton,
  EditorBar,
  RemoveButton,
  ValidationSummary,
  invalidIf,
  linesToList,
  listToLines,
  useEscapeKey,
} from '@/components/shared/editor-kit';

type Draft = Omit<RequirementDocument, 'sessionId' | 'generatedAt'>;

const PRIORITIES: RequirementPriority[] = ['must', 'should', 'could'];

/** Human-readable list of empty required fields (empty = valid). */
function validate(d: Draft, t: TFunction): string[] {
  const errs: string[] = [];
  d.functional.forEach((fr, i) => {
    if (!fr.id.trim()) errs.push(t('editor.validate.frId', { n: i + 1 }));
    if (!fr.title.trim())
      errs.push(t('editor.validate.frTitle', { ref: fr.id.trim() || i + 1 }));
  });
  d.nonFunctional.forEach((nfr, i) => {
    if (!nfr.id.trim()) errs.push(t('editor.validate.nfrId', { n: i + 1 }));
    if (!nfr.description.trim())
      errs.push(t('editor.validate.nfrDescription', { ref: nfr.id.trim() || i + 1 }));
  });
  d.roles.forEach((r, i) => {
    if (!r.name.trim()) errs.push(t('editor.validate.roleName', { n: i + 1 }));
  });
  d.businessRules.forEach((br, i) => {
    if (!br.id.trim()) errs.push(t('editor.validate.brId', { n: i + 1 }));
    if (!br.description.trim())
      errs.push(t('editor.validate.brDescription', { ref: br.id.trim() || i + 1 }));
  });
  return errs;
}

export function RequirementDocumentEditor({
  doc,
  sessionId,
  onSaved,
  onCancel,
  onDirty,
  onAutosaved,
}: {
  doc: RequirementDocument;
  sessionId: string;
  onSaved: (doc: RequirementDocument) => void;
  onCancel: () => void;
  /** Called on the first edit so the parent can guard against losing changes. */
  onDirty?: () => void;
  /** Called after a debounced autosave — persists without closing the editor. */
  onAutosaved?: (doc: RequirementDocument) => void;
}) {
  const { t } = useTranslation('stages');
  const [draft, setDraft] = useState<Draft>(() => ({
    functional: doc.functional,
    nonFunctional: doc.nonFunctional,
    roles: doc.roles,
    businessRules: doc.businessRules,
    constraints: doc.constraints,
    assumptions: doc.assumptions,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // Only surface field-level errors once the user has tried to save.
  const [attempted, setAttempted] = useState(false);

  const errors = validate(draft, t);
  const show = attempted; // highlight required-but-empty fields

  useEscapeKey(() => {
    if (!saving) onCancel();
  });

  /** Immutably edit the draft via a structured clone + mutation. */
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
    if (errors.length > 0) return; // block save; the summary tells them why
    setSaving(true);
    setError(null);
    try {
      const result = await requirementsApi.update(sessionId, draft);
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
      <Section title={t('editor.sections.functional')}>
        <div className="space-y-2">
          {draft.functional.map((fr, i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Input
                  className={`w-24 font-mono text-xs ${invalidIf(show && !fr.id.trim())}`}
                  value={fr.id}
                  placeholder="FR-1"
                  onChange={(e) => patch((d) => (d.functional[i].id = e.target.value))}
                />
                <Select
                  value={fr.priority}
                  onValueChange={(v) =>
                    patch((d) => (d.functional[i].priority = v as RequirementPriority))
                  }
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="ms-auto" />
                <RemoveButton onClick={() => patch((d) => d.functional.splice(i, 1))} />
              </div>
              <Input
                className={`mt-2 ${invalidIf(show && !fr.title.trim())}`}
                value={fr.title}
                placeholder={t('editor.field.shortTitle')}
                dir="auto"
                onChange={(e) => patch((d) => (d.functional[i].title = e.target.value))}
              />
              <Textarea
                className="mt-2"
                value={fr.description}
                placeholder={t('editor.field.description')}
                dir="auto"
                onChange={(e) =>
                  patch((d) => (d.functional[i].description = e.target.value))
                }
              />
            </div>
          ))}
          <AddButton
            onClick={() =>
              patch((d) =>
                d.functional.push({
                  id: `FR-${d.functional.length + 1}`,
                  title: '',
                  description: '',
                  priority: 'should',
                }),
              )
            }
          >
            {t('editor.add.functional')}
          </AddButton>
        </div>
      </Section>

      <Section title={t('editor.sections.nonFunctional')}>
        <div className="space-y-2">
          {draft.nonFunctional.map((nfr, i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Input
                  className={`w-24 font-mono text-xs ${invalidIf(show && !nfr.id.trim())}`}
                  value={nfr.id}
                  placeholder="NFR-1"
                  onChange={(e) => patch((d) => (d.nonFunctional[i].id = e.target.value))}
                />
                <Input
                  value={nfr.category}
                  placeholder={t('editor.field.category')}
                  dir="auto"
                  onChange={(e) =>
                    patch((d) => (d.nonFunctional[i].category = e.target.value))
                  }
                />
                <RemoveButton
                  onClick={() => patch((d) => d.nonFunctional.splice(i, 1))}
                />
              </div>
              <Textarea
                className={`mt-2 ${invalidIf(show && !nfr.description.trim())}`}
                value={nfr.description}
                placeholder={t('editor.field.description')}
                dir="auto"
                onChange={(e) =>
                  patch((d) => (d.nonFunctional[i].description = e.target.value))
                }
              />
            </div>
          ))}
          <AddButton
            onClick={() =>
              patch((d) =>
                d.nonFunctional.push({
                  id: `NFR-${d.nonFunctional.length + 1}`,
                  category: '',
                  description: '',
                }),
              )
            }
          >
            {t('editor.add.nonFunctional')}
          </AddButton>
        </div>
      </Section>

      <Section title={t('editor.sections.roles')}>
        <div className="space-y-2">
          {draft.roles.map((role, i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Input
                  className={invalidIf(show && !role.name.trim())}
                  value={role.name}
                  placeholder={t('editor.field.roleName')}
                  dir="auto"
                  onChange={(e) => patch((d) => (d.roles[i].name = e.target.value))}
                />
                <RemoveButton onClick={() => patch((d) => d.roles.splice(i, 1))} />
              </div>
              <Input
                className="mt-2"
                value={role.description}
                placeholder={t('editor.field.description')}
                dir="auto"
                onChange={(e) => patch((d) => (d.roles[i].description = e.target.value))}
              />
              <Label className="mt-2 block text-xs text-muted-foreground">
                {t('editor.field.permissions')}
              </Label>
              <Textarea
                className="mt-1"
                value={listToLines(role.permissions)}
                onChange={(e) =>
                  patch((d) => (d.roles[i].permissions = linesToList(e.target.value)))
                }
              />
            </div>
          ))}
          <AddButton
            onClick={() =>
              patch((d) =>
                d.roles.push({ name: '', description: '', permissions: [] }),
              )
            }
          >
            {t('editor.add.role')}
          </AddButton>
        </div>
      </Section>

      <Section title={t('editor.sections.businessRules')}>
        <div className="space-y-2">
          {draft.businessRules.map((br, i) => (
            <div key={i} className="flex items-start gap-2">
              <Input
                className={`w-24 font-mono text-xs ${invalidIf(show && !br.id.trim())}`}
                value={br.id}
                placeholder="BR-1"
                dir="ltr"
                onChange={(e) => patch((d) => (d.businessRules[i].id = e.target.value))}
              />
              <Textarea
                className={invalidIf(show && !br.description.trim())}
                value={br.description}
                placeholder={t('editor.field.rule')}
                dir="auto"
                onChange={(e) =>
                  patch((d) => (d.businessRules[i].description = e.target.value))
                }
              />
              <RemoveButton onClick={() => patch((d) => d.businessRules.splice(i, 1))} />
            </div>
          ))}
          <AddButton
            onClick={() =>
              patch((d) =>
                d.businessRules.push({
                  id: `BR-${d.businessRules.length + 1}`,
                  description: '',
                }),
              )
            }
          >
            {t('editor.add.businessRule')}
          </AddButton>
        </div>
      </Section>

      <Section title={t('editor.sections.constraints')}>
        <Textarea
          value={listToLines(draft.constraints)}
          dir="auto"
          onChange={(e) => patch((d) => (d.constraints = linesToList(e.target.value)))}
        />
      </Section>

      <Section title={t('editor.sections.assumptions')}>
        <Textarea
          value={listToLines(draft.assumptions)}
          dir="auto"
          onChange={(e) => patch((d) => (d.assumptions = linesToList(e.target.value)))}
        />
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
