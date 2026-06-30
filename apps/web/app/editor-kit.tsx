'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Save / Cancel action bar shared by every artifact editor. */
export function EditorBar({
  saving,
  error,
  onSave,
  onCancel,
}: {
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
      <Button onClick={onSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save changes'}
      </Button>
      <Button variant="secondary" onClick={onCancel} disabled={saving}>
        Cancel
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}

/** A small "× remove" icon button for list rows. */
export function RemoveButton({
  onClick,
  label = 'Remove',
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label={label}
      className="shrink-0 text-muted-foreground hover:text-destructive"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

/** A dashed "+ Add …" button placed under a list. */
export function AddButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
    >
      <Plus className="h-4 w-4" /> {children}
    </button>
  );
}

/** A tiny labelled checkbox (no checkbox component in the ui kit). */
export function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-1 text-xs text-muted-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-primary"
      />
      {label}
    </label>
  );
}

/** Split a textarea value into a trimmed, non-empty string list (one per line). */
export function linesToList(value: string): string[] {
  return value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Join a string list back into a one-per-line textarea value. */
export function listToLines(items: string[]): string {
  return items.join('\n');
}

/** Parse a comma-separated value into a trimmed, non-empty string list. */
export function csvToList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
