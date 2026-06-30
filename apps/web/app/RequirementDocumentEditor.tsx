'use client';

import { useState } from 'react';
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
import { requirementsApi } from '../lib/api';
import { Section } from './RequirementDocumentView';
import {
  AddButton,
  EditorBar,
  RemoveButton,
  linesToList,
  listToLines,
} from './editor-kit';

type Draft = Omit<RequirementDocument, 'sessionId' | 'generatedAt'>;

const PRIORITIES: RequirementPriority[] = ['must', 'should', 'could'];

export function RequirementDocumentEditor({
  doc,
  sessionId,
  onSaved,
  onCancel,
}: {
  doc: RequirementDocument;
  sessionId: string;
  onSaved: (doc: RequirementDocument) => void;
  onCancel: () => void;
}) {
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

  /** Immutably edit the draft via a structured clone + mutation. */
  const patch = (fn: (d: Draft) => void) =>
    setDraft((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });

  async function save() {
    setSaving(true);
    setError(null);
    try {
      onSaved(await requirementsApi.update(sessionId, draft));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Section title="Functional requirements">
        <div className="space-y-2">
          {draft.functional.map((fr, i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Input
                  className="w-24 font-mono text-xs"
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
                <span className="ml-auto" />
                <RemoveButton onClick={() => patch((d) => d.functional.splice(i, 1))} />
              </div>
              <Input
                className="mt-2"
                value={fr.title}
                placeholder="Short title"
                onChange={(e) => patch((d) => (d.functional[i].title = e.target.value))}
              />
              <Textarea
                className="mt-2"
                value={fr.description}
                placeholder="Description"
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
            Add functional requirement
          </AddButton>
        </div>
      </Section>

      <Section title="Non-functional requirements">
        <div className="space-y-2">
          {draft.nonFunctional.map((nfr, i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Input
                  className="w-24 font-mono text-xs"
                  value={nfr.id}
                  placeholder="NFR-1"
                  onChange={(e) => patch((d) => (d.nonFunctional[i].id = e.target.value))}
                />
                <Input
                  value={nfr.category}
                  placeholder="category (performance, security…)"
                  onChange={(e) =>
                    patch((d) => (d.nonFunctional[i].category = e.target.value))
                  }
                />
                <RemoveButton
                  onClick={() => patch((d) => d.nonFunctional.splice(i, 1))}
                />
              </div>
              <Textarea
                className="mt-2"
                value={nfr.description}
                placeholder="Description"
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
            Add non-functional requirement
          </AddButton>
        </div>
      </Section>

      <Section title="User roles">
        <div className="space-y-2">
          {draft.roles.map((role, i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={role.name}
                  placeholder="Role name"
                  onChange={(e) => patch((d) => (d.roles[i].name = e.target.value))}
                />
                <RemoveButton onClick={() => patch((d) => d.roles.splice(i, 1))} />
              </div>
              <Input
                className="mt-2"
                value={role.description}
                placeholder="Description"
                onChange={(e) => patch((d) => (d.roles[i].description = e.target.value))}
              />
              <Label className="mt-2 block text-xs text-muted-foreground">
                Permissions (one per line)
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
            Add role
          </AddButton>
        </div>
      </Section>

      <Section title="Business rules">
        <div className="space-y-2">
          {draft.businessRules.map((br, i) => (
            <div key={i} className="flex items-start gap-2">
              <Input
                className="w-24 font-mono text-xs"
                value={br.id}
                placeholder="BR-1"
                onChange={(e) => patch((d) => (d.businessRules[i].id = e.target.value))}
              />
              <Textarea
                value={br.description}
                placeholder="Rule"
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
            Add business rule
          </AddButton>
        </div>
      </Section>

      <Section title="Constraints (one per line)">
        <Textarea
          value={listToLines(draft.constraints)}
          onChange={(e) => patch((d) => (d.constraints = linesToList(e.target.value)))}
        />
      </Section>

      <Section title="Assumptions (one per line)">
        <Textarea
          value={listToLines(draft.assumptions)}
          onChange={(e) => patch((d) => (d.assumptions = linesToList(e.target.value)))}
        />
      </Section>

      <EditorBar saving={saving} error={error} onSave={save} onCancel={onCancel} />
    </div>
  );
}
