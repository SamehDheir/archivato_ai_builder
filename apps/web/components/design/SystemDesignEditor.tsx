'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { ArchitectureType, SystemDesign } from '@archivato/shared';
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
import { systemDesignApi } from '@/lib/api';
import { Section } from '@/components/design/RequirementDocumentView';
import {
  AddButton,
  EditorBar,
  RemoveButton,
  ValidationSummary,
  csvToList,
  invalidIf,
  useEscapeKey,
} from '@/components/shared/editor-kit';

type Draft = Omit<SystemDesign, 'sessionId' | 'generatedAt'>;

const ARCHITECTURES: ArchitectureType[] = [
  'monolith',
  'modular_monolith',
  'microservices',
];

function validate(d: Draft, t: TFunction): string[] {
  const errs: string[] = [];
  if (!d.architectureRationale.trim())
    errs.push(t('editor.validate.archRationale'));
  d.techStack.forEach((tech, i) => {
    if (!tech.layer.trim()) errs.push(t('editor.validate.techLayer', { n: i + 1 }));
    if (!tech.technology.trim())
      errs.push(t('editor.validate.techName', { ref: tech.layer.trim() || i + 1 }));
  });
  d.services.forEach((s, i) => {
    if (!s.name.trim()) errs.push(t('editor.validate.serviceName', { n: i + 1 }));
  });
  return errs;
}

export function SystemDesignEditor({
  design,
  sessionId,
  onSaved,
  onCancel,
  onDirty,
  onAutosaved,
}: {
  design: SystemDesign;
  sessionId: string;
  onSaved: (design: SystemDesign) => void;
  onCancel: () => void;
  onDirty?: () => void;
  /** Called after a debounced autosave — persists without closing the editor. */
  onAutosaved?: (design: SystemDesign) => void;
}) {
  const { t } = useTranslation('stages');
  const [draft, setDraft] = useState<Draft>(() => ({
    architecture: design.architecture,
    architectureRationale: design.architectureRationale,
    techStack: design.techStack,
    services: design.services,
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
      const result = await systemDesignApi.update(sessionId, draft);
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
      <Section title={t('editor.sections.architecture')}>
        <Select
          value={draft.architecture}
          onValueChange={(v) => patch((d) => (d.architecture = v as ArchitectureType))}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ARCHITECTURES.map((a) => (
              <SelectItem key={a} value={a}>
                {t(`editor.arch.${a}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Label className="mt-2 block text-xs text-muted-foreground">
          {t('editor.field.rationale')}
        </Label>
        <Textarea
          className={`mt-1 ${invalidIf(show && !draft.architectureRationale.trim())}`}
          value={draft.architectureRationale}
          dir="auto"
          onChange={(e) => patch((d) => (d.architectureRationale = e.target.value))}
        />
      </Section>

      <Section title={t('editor.sections.techStack')}>
        <div className="space-y-2">
          {draft.techStack.map((tech, i) => (
            <div key={i} className="flex items-start gap-2">
              <Input
                className={`w-32 ${invalidIf(show && !tech.layer.trim())}`}
                value={tech.layer}
                placeholder={t('editor.field.layer')}
                dir="auto"
                onChange={(e) => patch((d) => (d.techStack[i].layer = e.target.value))}
              />
              <Input
                className={`w-40 ${invalidIf(show && !tech.technology.trim())}`}
                value={tech.technology}
                placeholder={t('editor.field.technology')}
                dir="auto"
                onChange={(e) =>
                  patch((d) => (d.techStack[i].technology = e.target.value))
                }
              />
              <Input
                value={tech.rationale}
                placeholder={t('editor.field.why')}
                dir="auto"
                onChange={(e) =>
                  patch((d) => (d.techStack[i].rationale = e.target.value))
                }
              />
              <RemoveButton onClick={() => patch((d) => d.techStack.splice(i, 1))} />
            </div>
          ))}
          <AddButton
            onClick={() =>
              patch((d) =>
                d.techStack.push({ layer: '', technology: '', rationale: '' }),
              )
            }
          >
            {t('editor.add.tech')}
          </AddButton>
        </div>
      </Section>

      <Section title={t('editor.sections.services')}>
        <div className="space-y-2">
          {draft.services.map((s, i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Input
                  className={invalidIf(show && !s.name.trim())}
                  value={s.name}
                  placeholder={t('editor.field.serviceName')}
                  dir="auto"
                  onChange={(e) => patch((d) => (d.services[i].name = e.target.value))}
                />
                <RemoveButton onClick={() => patch((d) => d.services.splice(i, 1))} />
              </div>
              <Input
                className="mt-2"
                value={s.responsibility}
                placeholder={t('editor.field.responsibility')}
                dir="auto"
                onChange={(e) =>
                  patch((d) => (d.services[i].responsibility = e.target.value))
                }
              />
              <Label className="mt-2 block text-xs text-muted-foreground">
                {t('editor.field.dependsOn')}
              </Label>
              <Input
                className="mt-1"
                defaultValue={s.dependencies.join(', ')}
                placeholder="Auth, Users"
                onChange={(e) =>
                  patch((d) => (d.services[i].dependencies = csvToList(e.target.value)))
                }
              />
            </div>
          ))}
          <AddButton
            onClick={() =>
              patch((d) =>
                d.services.push({ name: '', responsibility: '', dependencies: [] }),
              )
            }
          >
            {t('editor.add.service')}
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
