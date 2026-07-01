'use client';

import { useState } from 'react';
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
import { systemDesignApi } from '../lib/api';
import { Section } from './RequirementDocumentView';
import {
  AddButton,
  EditorBar,
  RemoveButton,
  ValidationSummary,
  csvToList,
  invalidIf,
  useEscapeKey,
} from './editor-kit';

type Draft = Omit<SystemDesign, 'sessionId' | 'generatedAt'>;

const ARCHITECTURES: { value: ArchitectureType; label: string }[] = [
  { value: 'monolith', label: 'Monolith' },
  { value: 'modular_monolith', label: 'Modular Monolith' },
  { value: 'microservices', label: 'Microservices' },
];

function validate(d: Draft): string[] {
  const errs: string[] = [];
  if (!d.architectureRationale.trim())
    errs.push('Architecture rationale is required.');
  d.techStack.forEach((t, i) => {
    if (!t.layer.trim()) errs.push(`Tech choice ${i + 1} needs a layer.`);
    if (!t.technology.trim())
      errs.push(`Tech choice ${t.layer.trim() || i + 1} needs a technology.`);
  });
  d.services.forEach((s, i) => {
    if (!s.name.trim()) errs.push(`Service ${i + 1} needs a name.`);
  });
  return errs;
}

export function SystemDesignEditor({
  design,
  sessionId,
  onSaved,
  onCancel,
  onDirty,
}: {
  design: SystemDesign;
  sessionId: string;
  onSaved: (design: SystemDesign) => void;
  onCancel: () => void;
  onDirty?: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => ({
    architecture: design.architecture,
    architectureRationale: design.architectureRationale,
    techStack: design.techStack,
    services: design.services,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  const errors = validate(draft);
  const show = attempted;

  useEscapeKey(() => {
    if (!saving) onCancel();
  });

  const patch = (fn: (d: Draft) => void) => {
    onDirty?.();
    setDraft((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  };

  async function save() {
    setAttempted(true);
    if (errors.length > 0) return;
    setSaving(true);
    setError(null);
    try {
      onSaved(await systemDesignApi.update(sessionId, draft));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Section title="Architecture">
        <Select
          value={draft.architecture}
          onValueChange={(v) => patch((d) => (d.architecture = v as ArchitectureType))}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ARCHITECTURES.map((a) => (
              <SelectItem key={a.value} value={a.value}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Label className="mt-2 block text-xs text-muted-foreground">Rationale</Label>
        <Textarea
          className={`mt-1 ${invalidIf(show && !draft.architectureRationale.trim())}`}
          value={draft.architectureRationale}
          onChange={(e) => patch((d) => (d.architectureRationale = e.target.value))}
        />
      </Section>

      <Section title="Tech stack">
        <div className="space-y-2">
          {draft.techStack.map((t, i) => (
            <div key={i} className="flex items-start gap-2">
              <Input
                className={`w-32 ${invalidIf(show && !t.layer.trim())}`}
                value={t.layer}
                placeholder="layer"
                onChange={(e) => patch((d) => (d.techStack[i].layer = e.target.value))}
              />
              <Input
                className={`w-40 ${invalidIf(show && !t.technology.trim())}`}
                value={t.technology}
                placeholder="technology"
                onChange={(e) =>
                  patch((d) => (d.techStack[i].technology = e.target.value))
                }
              />
              <Input
                value={t.rationale}
                placeholder="why"
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
            Add tech choice
          </AddButton>
        </div>
      </Section>

      <Section title="Services">
        <div className="space-y-2">
          {draft.services.map((s, i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Input
                  className={invalidIf(show && !s.name.trim())}
                  value={s.name}
                  placeholder="Service name"
                  onChange={(e) => patch((d) => (d.services[i].name = e.target.value))}
                />
                <RemoveButton onClick={() => patch((d) => d.services.splice(i, 1))} />
              </div>
              <Input
                className="mt-2"
                value={s.responsibility}
                placeholder="Responsibility"
                onChange={(e) =>
                  patch((d) => (d.services[i].responsibility = e.target.value))
                }
              />
              <Label className="mt-2 block text-xs text-muted-foreground">
                Depends on (comma-separated service names)
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
            Add service
          </AddButton>
        </div>
      </Section>

      {show && <ValidationSummary errors={errors} />}
      <EditorBar saving={saving} error={error} onSave={save} onCancel={onCancel} />
    </div>
  );
}
