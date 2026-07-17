'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Ban,
  Check,
  MessageSquarePlus,
  ScissorsLineDashed,
  Wand2,
} from 'lucide-react';
import {
  draftClientQuestion,
  draftOutOfScope,
  type FindingStatus,
  type ReviewFinding,
} from '@archivato/shared';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** What the owner can do about one finding, by its action type. */
export interface FindingHandlers {
  onPropose: (findingId: string) => void;
  onAddClientQuestion: (findingId: string, question: string) => void;
  onAddOutOfScope: (findingId: string, item: string) => void;
  onAdvisory: (
    findingId: string,
    action: 'acknowledged' | 'dismissed',
    note?: string,
  ) => void;
}

const STATUS_CLASS: Record<FindingStatus, string> = {
  open: 'border-border text-muted-foreground',
  resolved: 'border-success/40 bg-success-subtle text-success-subtle-foreground',
  converted: 'border-info/40 bg-info-subtle text-info-subtle-foreground',
  dismissed: 'border-border bg-muted text-muted-foreground',
};

/** The status chip. Rendered for every finding, so `open` is visible too. */
export function StatusChip({ status }: { status: FindingStatus }) {
  const { t } = useTranslation('stages');
  return (
    <Badge variant="outline" className={cn('gap-1', STATUS_CLASS[status])}>
      {status !== 'open' && <Check className="h-3 w-3" />}
      {t(`review.fix.status.${status}`, { defaultValue: status })}
    </Badge>
  );
}

/**
 * The action row under a finding (R11).
 *
 * Every button here opens a confirmation step — a preview modal for a patch, an
 * inline editable field for a conversion or a dismissal note. **Nothing on this
 * row mutates an artifact on its own click**; each one either drafts (no write) or
 * reveals the text the owner must confirm. That is the no-silent-fix rule
 * expressed in the UI, and it is why there is no "apply" affordance here at all.
 *
 * A finding that is already resolved shows its chip and no actions — re-offering a
 * fix for something dealt with is how a tool teaches people to ignore it.
 */
export function FindingActions({
  finding,
  busy,
  handlers,
}: {
  finding: ReviewFinding;
  busy: boolean;
  handlers: FindingHandlers;
}) {
  const { t } = useTranslation('stages');
  const [editing, setEditing] = useState<
    null | 'question' | 'outOfScope' | 'dismiss'
  >(null);
  const [text, setText] = useState('');

  const id = finding.id;
  const status = finding.status ?? 'open';
  if (!id || status !== 'open') return null;

  const open = (
    mode: 'question' | 'outOfScope' | 'dismiss',
    prefill: string,
  ) => {
    setEditing(mode);
    setText(prefill);
  };

  const confirm = () => {
    const value = text.trim();
    if (editing === 'question') handlers.onAddClientQuestion(id, value);
    else if (editing === 'outOfScope') handlers.onAddOutOfScope(id, value);
    else if (editing === 'dismiss') handlers.onAdvisory(id, 'dismissed', value);
    setEditing(null);
  };

  if (editing) {
    // `dismiss` takes an optional note, so it alone may be confirmed empty.
    const canConfirm = editing === 'dismiss' || text.trim().length > 0;
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canConfirm) confirm();
            if (e.key === 'Escape') setEditing(null);
          }}
          placeholder={t(`review.fix.placeholder.${editing}`)}
          className="h-8 min-w-0 flex-1 text-sm"
          dir="auto"
          autoFocus
        />
        <Button size="sm" onClick={confirm} disabled={busy || !canConfirm}>
          {t('review.fix.confirm')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
          {t('review.fix.cancel')}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {finding.actionType === 'patch' && (
        <ActionButton
          icon={Wand2}
          label={t('review.fix.propose')}
          onClick={() => handlers.onPropose(id)}
          busy={busy}
        />
      )}

      {finding.actionType === 'needs_client' && (
        <>
          <ActionButton
            icon={MessageSquarePlus}
            label={t('review.fix.addQuestion')}
            onClick={() => open('question', draftClientQuestion(finding))}
            busy={busy}
          />
          <ActionButton
            icon={ScissorsLineDashed}
            label={t('review.fix.addOutOfScope')}
            onClick={() => open('outOfScope', draftOutOfScope(finding))}
            busy={busy}
          />
        </>
      )}

      <ActionButton
        icon={Check}
        label={t('review.fix.acknowledge')}
        onClick={() => handlers.onAdvisory(id, 'acknowledged')}
        busy={busy}
      />
      <ActionButton
        icon={Ban}
        label={t('review.fix.dismiss')}
        onClick={() => open('dismiss', '')}
        busy={busy}
      />
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  busy,
}: {
  icon: typeof Wand2;
  label: string;
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 gap-1 px-2 text-xs"
      onClick={onClick}
      disabled={busy}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}
