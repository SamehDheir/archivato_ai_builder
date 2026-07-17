'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  History,
  Link2,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import {
  appendProposalDraft,
  PROPOSAL_CEILINGS,
  PROPOSAL_CHANNELS,
  PROPOSAL_LOCALES,
  proposalCharCount,
  resolveProposalLocale,
  type ProposalChannel,
  type ProposalDraft,
  type ProposalLocale,
} from '@archivato/shared';
import { proposalApi } from '@/lib/api';
import { useLocale } from '@/components/shared/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/**
 * "Write the proposal message" (R13) — the last step from a finished scoping to a
 * submitted bid.
 *
 * Two things about the shape of this screen are deliberate:
 *
 * 1. **The draft lands in a textarea, not a preview.** This is the owner's message,
 *    going out under their name — the model's job is to save them the blank page,
 *    not to have the last word. So the result is editable in place and the copy
 *    button copies what is *on screen*, not what was generated.
 * 2. **The link is shown separately from the message.** Upwork and Mostaql put
 *    links in their own field, and an owner who pastes the message into one and
 *    then hunts for the URL has been made to do our job.
 */
export function ProposalModal({
  sessionId,
  clientName,
  suggestedPrice,
  onClose,
}: {
  sessionId: string;
  /** Prefill from the project's client (R5). Still editable — this bid may differ. */
  clientName?: string | null;
  /** Prefill from R9's suggested price when a weekly rate is set. Always editable. */
  suggestedPrice?: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation('stages');
  const { locale: uiLocale } = useLocale();
  const projectLocale: ProposalLocale = uiLocale === 'ar' ? 'ar' : 'en';

  const [channel, setChannel] = useState<ProposalChannel>('upwork');
  const [localeChoice, setLocaleChoice] = useState<ProposalLocale | ''>('');
  const [client, setClient] = useState(clientName ?? '');
  const [senderName, setSenderName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [includePrice, setIncludePrice] = useState(false);
  const [price, setPrice] = useState(suggestedPrice ?? '');
  const [customHook, setCustomHook] = useState('');

  const [draft, setDraft] = useState<ProposalDraft | null>(null);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<ProposalDraft[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [variant, setVariant] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'message' | 'link' | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>();

  // What the server will pick, computed with the same shared rule — so the form
  // shows the language it will actually write in rather than a guess.
  const effectiveLocale = resolveProposalLocale(
    channel,
    localeChoice || undefined,
    projectLocale,
  );
  // The ceiling of the draft on screen — which is not always the form's current
  // channel. Reopening a Mostaql draft (700) from history while the channel chip
  // reads Upwork must still measure it against 700, or the counter says a message
  // that cannot be sent is fine. That is exactly why the draft stores its own
  // `ceiling`. Before the first draft there is nothing on screen, so the form's
  // channel is the honest answer.
  const ceiling = draft?.ceiling ?? PROPOSAL_CEILINGS[channel];
  const count = proposalCharCount(message);
  const over = count > ceiling;
  const overChannel = draft?.channel ?? channel;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  useEffect(() => {
    let alive = true;
    proposalApi
      .drafts(sessionId)
      .then((d) => alive && setHistory(d))
      .catch(() => undefined); // non-fatal: the history panel just stays empty
    return () => {
      alive = false;
    };
  }, [sessionId]);

  // The "Copied" label resets on a timer; clearing it on unmount stops a pending
  // reset from firing after the modal closes, and stops a first copy's timer from
  // wiping the label a second copy just set.
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const generate = useCallback(
    async (nextVariant: number) => {
      setBusy(true);
      setError(null);
      try {
        const result = await proposalApi.generate(sessionId, {
          channel,
          locale: localeChoice || undefined,
          projectLocale,
          clientName: client.trim() || undefined,
          senderName: senderName.trim() || undefined,
          companyName: companyName.trim() || undefined,
          includePrice,
          // Sent only when the box is ticked, so an abandoned figure in the form
          // can't ride along — the server drops it too, but the payload should
          // never carry a price the owner didn't ask for.
          price: includePrice ? price.trim() || undefined : undefined,
          customHook: customHook.trim() || undefined,
          variant: nextVariant,
        });
        setDraft(result);
        setMessage(result.message);
        setVariant(nextVariant);
        // The shared helper owns the cap, so the client can't drift from the server.
        setHistory((h) => appendProposalDraft(h, result));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [
      sessionId,
      channel,
      localeChoice,
      projectLocale,
      client,
      senderName,
      companyName,
      includePrice,
      price,
      customHook,
    ],
  );

  async function copy(text: string, what: 'message' | 'link') {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in"
        onClick={busy ? undefined : onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="proposal-title"
        className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl animate-in fade-in zoom-in-95"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-5 pb-4">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 shrink-0 text-primary" />
            <div>
              <h2 id="proposal-title" className="text-base font-semibold">
                {t('proposal.title')}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('proposal.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            aria-label={t('proposal.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          {/* Controls. Only the channel is required — everything else narrows a
              message the scoping can already produce on its own. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('proposal.channel.label')}>
              <div className="flex flex-wrap gap-1.5">
                {PROPOSAL_CHANNELS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChannel(c)}
                    className={cn(
                      'rounded-md border px-2.5 py-1 text-xs transition-colors',
                      channel === c
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {t(`proposal.channel.${c}`)}
                  </button>
                ))}
              </div>
            </Field>

            <Field label={t('proposal.language.label')}>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setLocaleChoice('')}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-xs transition-colors',
                    localeChoice === ''
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {t('proposal.language.auto', {
                    lang: t(`proposal.language.${effectiveLocale}`),
                  })}
                </button>
                {PROPOSAL_LOCALES.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLocaleChoice(l)}
                    className={cn(
                      'rounded-md border px-2.5 py-1 text-xs transition-colors',
                      localeChoice === l
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {t(`proposal.language.${l}`)}
                  </button>
                ))}
              </div>
            </Field>

            <Field label={t('proposal.clientName')}>
              <Input
                value={client}
                onChange={(e) => setClient(e.target.value)}
                placeholder={t('proposal.clientNamePlaceholder')}
                dir="auto"
              />
            </Field>

            <Field label={t('proposal.senderName')}>
              <div className="flex gap-2">
                <Input
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder={t('proposal.senderNamePlaceholder')}
                  dir="auto"
                />
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder={t('proposal.companyNamePlaceholder')}
                  dir="auto"
                />
              </div>
            </Field>
          </div>

          <Field label={t('proposal.hook')}>
            <Input
              value={customHook}
              onChange={(e) => setCustomHook(e.target.value)}
              placeholder={t('proposal.hookPlaceholder')}
              dir="auto"
            />
          </Field>

          {/* Price. Off by default, and the figure is the owner's — we only ever
              prefill it from their own rate × the effort estimate. */}
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={includePrice}
                onChange={(e) => setIncludePrice(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              {t('proposal.price.include')}
            </label>
            {includePrice && (
              <div className="mt-2.5 space-y-1.5">
                <Input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder={t('proposal.price.placeholder')}
                  dir="auto"
                  aria-label={t('proposal.price.include')}
                />
                <p className="text-xs text-muted-foreground">
                  {suggestedPrice
                    ? t('proposal.price.prefilled')
                    : t('proposal.price.hint')}
                </p>
              </div>
            )}
          </div>

          {!draft ? (
            <Button
              className="w-full"
              disabled={busy}
              onClick={() => void generate(0)}
            >
              <Sparkles className={cn('h-4 w-4', busy && 'animate-pulse')} />
              {busy ? t('proposal.writing') : t('proposal.write')}
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>{t('proposal.draft')}</Label>
                <span
                  className={cn(
                    'text-xs tabular-nums',
                    over ? 'font-medium text-destructive' : 'text-muted-foreground',
                  )}
                  dir="ltr"
                >
                  {count} / {ceiling}
                </span>
              </div>

              {/* The draft is editable, and it is what gets copied. */}
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                dir="auto"
                rows={12}
                className="min-h-[240px] font-normal leading-relaxed"
                aria-label={t('proposal.draft')}
              />

              {/* Over the ceiling: warn, never cut. The model already had its one
                  shorten retry; from here the owner's judgement about what to lose
                  beats any substring we could take. */}
              {over && (
                <p className="flex items-start gap-1.5 text-xs text-destructive">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {t('proposal.overLength', {
                    n: count - ceiling,
                    channel: t(`proposal.channel.${overChannel}`),
                  })}
                </p>
              )}
              {draft.source === 'fallback' && (
                <p className="text-xs text-muted-foreground">
                  {t('proposal.fallbackNote')}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button disabled={busy} onClick={() => void copy(message, 'message')}>
                  {copied === 'message' ? <Check /> : <Copy />}
                  {copied === 'message' ? t('proposal.copied') : t('proposal.copy')}
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void generate(variant + 1)}
                >
                  <RefreshCw className={cn('h-4 w-4', busy && 'animate-spin')} />
                  {busy ? t('proposal.writing') : t('proposal.regenerate')}
                </Button>
                {history.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowHistory((v) => !v)}
                    className="text-muted-foreground"
                  >
                    <History className="h-3.5 w-3.5" />
                    {t('proposal.history.toggle')}
                  </Button>
                )}
              </div>

              {/* The link, on its own — most platforms want it in a separate field. */}
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  <Link2 className="h-3.5 w-3.5" />
                  {t('proposal.link.label')}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Input
                    readOnly
                    dir="ltr"
                    value={draft.shareUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="max-w-sm font-mono text-xs"
                    aria-label={t('proposal.link.label')}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void copy(draft.shareUrl, 'link')}
                  >
                    {copied === 'link' ? <Check /> : <Copy />}
                    {copied === 'link' ? t('proposal.copied') : t('proposal.link.copy')}
                  </Button>
                  <a
                    href={draft.shareUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {t('proposal.link.preview')}
                  </a>
                </div>
              </div>

              {showHistory && history.length > 1 && (
                <div className="space-y-2 rounded-lg border border-border p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t('proposal.history.title', { n: history.length })}
                  </p>
                  {history.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => {
                        setDraft(d);
                        setMessage(d.message);
                        setShowHistory(false);
                      }}
                      className="flex w-full flex-col gap-1 rounded-md border border-border p-2 text-start hover:bg-muted"
                    >
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="rounded bg-muted px-1.5 py-0.5">
                          {t(`proposal.channel.${d.channel}`)}
                        </span>
                        <span dir="ltr">{d.charCount}</span>
                        {d.includedPrice && <span>{t('proposal.history.priced')}</span>}
                        {d.overLength && (
                          <span className="text-destructive">
                            {t('proposal.history.over')}
                          </span>
                        )}
                      </span>
                      <span className="line-clamp-2 text-xs" dir="auto">
                        {d.message}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive" dir="auto">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
