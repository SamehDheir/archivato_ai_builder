'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Check as CheckIcon, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Call `handler` when Escape is pressed — but NOT while a dropdown (Radix
 * popper) or a modal dialog is open, since those consume Escape themselves.
 * Used to cancel an open editor.
 */
export function useEscapeKey(handler: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // A Select/dropdown or a confirm dialog is open — let it handle Escape.
      if (
        document.querySelector(
          '[data-radix-popper-content-wrapper],[role="dialog"],[role="alertdialog"]',
        )
      ) {
        return;
      }
      handler();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handler]);
}

/**
 * Save / Cancel action bar shared by every artifact editor, with a live save
 * status (Unsaved changes · Saving… · Saved). When `onAutosave` is supplied,
 * valid edits persist automatically on a short debounce, so the explicit "Save
 * changes" button becomes a force-save.
 */
export function EditorBar({
  saving,
  error,
  onSave,
  onCancel,
  dirty = false,
  canSave = true,
  savedAt = null,
  onAutosave,
}: {
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onCancel: () => void;
  /** Whether the draft has unsaved edits (drives the status + autosave). */
  dirty?: boolean;
  /** Whether the draft passes validation (blocks save/autosave when false). */
  canSave?: boolean;
  /** Epoch ms of the last successful save (drives the "Saved" state). */
  savedAt?: number | null;
  /** When provided, valid edits autosave on a debounce. */
  onAutosave?: () => void;
}) {
  const { t } = useTranslation('stages');
  // Debounced autosave: fire once edits settle and the draft is valid. Each edit
  // re-runs this effect (new `onAutosave` identity), resetting the timer.
  useEffect(() => {
    if (!onAutosave || !dirty || !canSave || saving) return;
    const timer = setTimeout(() => onAutosave(), 1200);
    return () => clearTimeout(timer);
  }, [onAutosave, dirty, canSave, saving]);

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
      <Button onClick={() => onSave()} disabled={saving || !dirty}>
        {saving ? t('editor.saving') : t('editor.save')}
      </Button>
      <Button
        variant="secondary"
        // With autosave on, "Done" flushes a valid pending edit before closing so
        // nothing typed in the last debounce window is lost.
        onClick={() =>
          onAutosave && dirty && canSave ? onSave() : onCancel()
        }
        disabled={saving}
      >
        {onAutosave ? t('editor.done') : t('editor.cancel')}
      </Button>
      <SaveStatus saving={saving} dirty={dirty} canSave={canSave} savedAt={savedAt} />
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}

/** The little "Unsaved changes / Saving… / Saved" pill next to the save button. */
function SaveStatus({
  saving,
  dirty,
  canSave,
  savedAt,
}: {
  saving: boolean;
  dirty: boolean;
  canSave: boolean;
  savedAt: number | null;
}) {
  const { t } = useTranslation('stages');
  if (saving) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> {t('editor.saving')}
      </span>
    );
  }
  if (dirty && !canSave) {
    return (
      <span className="text-xs font-medium text-amber-600 dark:text-amber-500">
        {t('editor.fixErrors')}
      </span>
    );
  }
  if (dirty) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-500">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{' '}
        {t('editor.unsaved')}
      </span>
    );
  }
  if (savedAt) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <CheckIcon className="h-3 w-3 text-primary" /> {t('editor.saved')}
      </span>
    );
  }
  return null;
}

/** Tailwind classes marking an input/select as invalid (red border + ring). */
export const INVALID_FIELD =
  'border-destructive focus-visible:ring-destructive';

/** Returns the invalid classes when `cond` is true, else an empty string. */
export function invalidIf(cond: boolean): string {
  return cond ? INVALID_FIELD : '';
}

/**
 * A summary of validation problems, shown above the EditorBar once the user has
 * attempted to save. Lets us flag empty required fields in-app instead of
 * bouncing off the API's 400.
 */
export function ValidationSummary({ errors }: { errors: string[] }) {
  const { t } = useTranslation('stages');
  if (errors.length === 0) return null;
  return (
    <div
      role="alert"
      className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
    >
      <p className="font-medium">
        {t('editor.fixToSave', { count: errors.length })}
      </p>
      <ul className="mt-1 list-disc space-y-0.5 ps-5">
        {errors.slice(0, 8).map((e, i) => (
          <li key={i} dir="auto">
            {e}
          </li>
        ))}
        {errors.length > 8 && <li>{t('editor.andMore', { count: errors.length - 8 })}</li>}
      </ul>
    </div>
  );
}

/** A small "× remove" icon button for list rows. */
export function RemoveButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label?: string;
}) {
  const { t } = useTranslation('stages');
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label={label ?? t('editor.remove')}
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
      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
