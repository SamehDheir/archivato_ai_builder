'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  Paperclip,
  Send,
  Lock,
  FolderGit2,
  User as UserIcon,
  Clock,
} from 'lucide-react';
import type {
  SupportAgentRef,
  SupportAiAnalysis,
  SupportTicketDetail as Detail,
} from '@archivato/shared';
import {
  SUPPORT_ATTACHMENT_MAX_BYTES,
  SUPPORT_ATTACHMENT_MIME_TYPES,
} from '@archivato/shared';
import { supportAdminApi, supportApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/shared/toast';
import { MessageBody } from '@/components/support/SupportNav';
import {
  CATEGORIES,
  CategoryBadge,
  PRIORITIES,
  PriorityBadge,
  STATUSES,
  StatusBadge,
  useSupportMeta,
} from '@/components/support/support-meta';

const UNASSIGNED = 'unassigned';

/** Best-effort client-side check whether a file is text we can extract for AI. */
function isTextFile(file: File): boolean {
  return (
    /^text\//.test(file.type) ||
    file.type === 'application/json' ||
    /\.(log|txt|json|md|csv|yml|yaml)$/i.test(file.name)
  );
}

/** Per-action capabilities for the staff (admin) view, from the user's permissions. */
export interface TicketCaps {
  reply: boolean;
  manage: boolean;
  assign: boolean;
  note: boolean;
  copilot: boolean;
}

const ALL_CAPS: TicketCaps = {
  reply: true,
  manage: true,
  assign: true,
  note: true,
  copilot: true,
};

export function TicketDetail({
  ticketId,
  admin,
  caps = ALL_CAPS,
}: {
  ticketId: string;
  admin: boolean;
  /** Staff capabilities (admin view only). Customers act on their own tickets. */
  caps?: TicketCaps;
}) {
  const toast = useToast();
  // In the customer view the owner may always act on their own ticket; in the
  // staff view each control is gated by the matching permission.
  const canReply = !admin || caps.reply;
  const canChangeStatus = !admin || caps.manage;
  const showAi = !admin || caps.copilot;
  const showAdminCard = admin && (caps.manage || caps.assign || caps.note);
  const { t, statusLabel, priorityLabel, categoryLabel, timeAgo, eventLabel } =
    useSupportMeta();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [analysis, setAnalysis] = useState<SupportAiAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [agents, setAgents] = useState<SupportAgentRef[]>([]);
  const [note, setNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Admins fetch via the admin route (includes internal notes); replies always
  // go through the customer route (the service authorizes admins there too).
  const getDetail = useCallback(
    (id: string) => (admin ? supportAdminApi.get(id) : supportApi.get(id)),
    [admin],
  );

  const load = useCallback(async () => {
    const d = await getDetail(ticketId);
    setDetail(d);
  }, [getDetail, ticketId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await getDetail(ticketId);
        if (!cancelled) setDetail(d);
        if (admin) supportAdminApi.agents().then(setAgents).catch(() => undefined);
      } catch (e) {
        if (!cancelled)
          toast({
            title: t('detail.loadFailed'),
            description: e instanceof Error ? e.message : String(e),
            variant: 'error',
          });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId, admin]);

  async function run<T>(fn: () => Promise<T>, errTitle: string): Promise<T | undefined> {
    try {
      return await fn();
    } catch (e) {
      toast({
        title: errTitle,
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
      return undefined;
    }
  }

  async function sendReply() {
    if (reply.trim().length === 0) return;
    setSending(true);
    const d = await run(() => supportApi.reply(ticketId, reply), t('detail.replyFailed'));
    if (d) {
      setDetail(d);
      setReply('');
    }
    setSending(false);
  }

  async function changeStatus(action: 'close' | 'reopen') {
    const d = await run(
      () => (action === 'close' ? supportApi.close(ticketId) : supportApi.reopen(ticketId)),
      t('detail.updateStatusFailed'),
    );
    if (d) setDetail(d);
  }

  async function analyze() {
    setAnalyzing(true);
    const result = await run(
      () => (admin ? supportAdminApi.copilot(ticketId) : supportApi.analyze(ticketId)),
      t('create.aiUnavailable'),
    );
    if (result) {
      setAnalysis(result);
      await load().catch(() => undefined); // refresh timeline (ai_suggestion event)
    }
    setAnalyzing(false);
  }

  async function adminUpdate(patch: {
    status?: string;
    priority?: string;
    category?: string;
    assigneeId?: string | null;
  }) {
    const d = await run(() => supportAdminApi.update(ticketId, patch), t('detail.updateFailed'));
    if (d) {
      setDetail(d);
      toast({ title: t('detail.updated'), variant: 'success' });
    }
  }

  async function addNote() {
    if (note.trim().length === 0) return;
    const d = await run(() => supportAdminApi.addNote(ticketId, note), t('detail.addNoteFailed'));
    if (d) {
      setDetail(d);
      setNote('');
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > SUPPORT_ATTACHMENT_MAX_BYTES) {
      toast({ title: t('detail.fileTooLarge'), variant: 'error' });
      return;
    }
    const mime = file.type || 'text/plain';
    if (!(SUPPORT_ATTACHMENT_MIME_TYPES as string[]).includes(mime) && !isTextFile(file)) {
      toast({ title: t('detail.unsupportedType'), variant: 'error' });
      return;
    }
    const textContent = isTextFile(file)
      ? (await file.text()).slice(0, 200000)
      : undefined;
    const d = await run(
      () =>
        supportApi.addAttachment(ticketId, {
          filename: file.name,
          mimeType: (SUPPORT_ATTACHMENT_MIME_TYPES as string[]).includes(mime)
            ? mime
            : 'text/plain',
          sizeBytes: file.size,
          textContent,
        }),
      t('detail.uploadFailed'),
    );
    if (d) {
      setDetail(d);
      toast({ title: t('detail.attachmentAdded'), variant: 'success' });
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }
  if (!detail) return null;

  const backHref = admin ? '/support/admin' : '/support';
  const isClosed = detail.status === 'closed';

  return (
    <div className="space-y-4">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" />
        {admin ? t('detail.backAdmin') : t('detail.backMine')}
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>#{detail.number}</span>
            <span>·</span>
            <span>
              {t('detail.opened')} {timeAgo(detail.createdAt)}
            </span>
          </div>
          <h1 dir="auto" className="mt-1 text-xl font-bold">
            {detail.subject}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={detail.status} />
            <PriorityBadge priority={detail.priority} />
            <CategoryBadge category={detail.category} />
          </div>
        </div>
        {canChangeStatus && (
          <div className="flex gap-2">
            {isClosed ? (
              <Button variant="secondary" size="sm" onClick={() => changeStatus('reopen')}>
                {t('detail.reopen')}
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => changeStatus('close')}>
                {t('detail.close')}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Main column: conversation + reply + timeline */}
        <div className="space-y-4">
          <div className="space-y-3">
            {detail.messages.map((m) => (
              <Card
                key={m.id}
                className={
                  m.authorType === 'admin'
                    ? 'border-primary/30 bg-primary/5 p-4'
                    : 'p-4'
                }
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    {m.authorType === 'ai' && (
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                    )}
                    {m.authorType === 'admin' ? (
                      <span className="text-primary">
                        {(m.authorName ?? t('detail.support')) +
                          ' · ' +
                          t('detail.supportTeam')}
                      </span>
                    ) : m.authorType === 'ai' ? (
                      <span className="text-primary">{t('detail.aiAssistant')}</span>
                    ) : (
                      <span>{m.authorName ?? t('detail.you')}</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {timeAgo(m.createdAt)}
                  </span>
                </div>
                <MessageBody body={m.body} />
                {m.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.attachments.map((a) => (
                      <Badge key={a.id} variant="secondary">
                        <Paperclip className="me-1 h-3 w-3" />
                        {a.filename}
                        {a.isText && ` · ${t('detail.text')}`}
                      </Badge>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>

          {/* All attachments on the ticket */}
          {detail.attachments.length > 0 && (
            <Card className="p-3">
              <div className="text-xs font-semibold text-muted-foreground">
                {t('detail.attachments')}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {detail.attachments.map((a) => (
                  <Badge key={a.id} variant="secondary">
                    <Paperclip className="me-1 h-3 w-3" />
                    {a.filename}
                    <span className="ms-1 text-muted-foreground">
                      {(a.sizeBytes / 1024).toFixed(0)} KB
                    </span>
                  </Badge>
                ))}
              </div>
            </Card>
          )}

          {/* Reply box */}
          {isClosed ? (
            <Card className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Lock className="h-4 w-4" /> {t('detail.closedNotice')}
            </Card>
          ) : !canReply ? (
            <Card className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Lock className="h-4 w-4" /> {t('detail.readOnlyNotice')}
            </Card>
          ) : (
            <Card className="p-4">
              <Textarea
                dir="auto"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder={t('detail.replyPlaceholder')}
                className="min-h-[100px]"
              />
              <div className="mt-2 flex items-center gap-2">
                <Button onClick={sendReply} disabled={sending || !reply.trim()}>
                  {sending ? (
                    <Loader2 className="me-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="me-1.5 h-4 w-4 rtl:-scale-x-100" />
                  )}
                  {t('detail.sendReply')}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={onFile}
                  accept=".log,.txt,.json,.md,.csv,.yml,.yaml,image/*,application/pdf,.zip"
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => fileRef.current?.click()}
                >
                  <Paperclip className="me-1.5 h-4 w-4" /> {t('detail.attach')}
                </Button>
              </div>
            </Card>
          )}

          {/* Timeline */}
          <Card className="p-4">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <Clock className="h-4 w-4" /> {t('detail.timeline')}
            </div>
            <ol className="space-y-2">
              {detail.events.map((ev) => (
                <li key={ev.id} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="text-muted-foreground">
                    <span className="text-foreground">{eventLabel(ev.type)}</span>
                    {ev.actorName
                      ? ` ${t('detail.by', { name: ev.actorName })}`
                      : ev.actorType === 'ai'
                        ? ` ${t('detail.byAi')}`
                        : ''}
                    {' · '}
                    {timeAgo(ev.createdAt)}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        {/* Sidebar: AI assistant + context + admin controls */}
        <div className="space-y-4">
          {/* AI assistant / copilot */}
          {showAi && (
          <Card className="border-primary/30 p-4">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              {admin ? t('detail.copilot') : t('detail.aiAssistant')}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {admin ? t('detail.copilotSubtitle') : t('detail.assistantSubtitle')}
            </p>
            <Button
              type="button"
              size="sm"
              className="mt-2"
              onClick={analyze}
              disabled={analyzing}
            >
              {analyzing ? (
                <Loader2 className="me-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="me-1.5 h-4 w-4" />
              )}
              {analysis ? t('detail.reAnalyze') : t('detail.analyze')}
            </Button>

            {analysis && (
              <div className="mt-3 space-y-2.5 text-sm">
                <AiField label={t('detail.issueSummary')} value={analysis.summary} />
                <AiField label={t('detail.rootCause')} value={analysis.rootCause} />
                <AiField label={t('detail.suggestedFix')} value={analysis.suggestedFix} />
                <div>
                  <div className="text-xs font-semibold text-muted-foreground">
                    {t('detail.suggestedReply')}
                  </div>
                  <p dir="auto" className="mt-0.5 whitespace-pre-wrap">
                    {analysis.suggestedReply}
                  </p>
                  {!isClosed && canReply && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="mt-1.5"
                      onClick={() => setReply(analysis.suggestedReply)}
                    >
                      {t('detail.useAsReply')}
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Badge variant="outline">
                    {t('detail.suggestedCategory', {
                      category: categoryLabel(analysis.suggestedCategory),
                    })}
                  </Badge>
                  <PriorityBadge priority={analysis.suggestedPriority} />
                </div>
                {admin && analysis.suggestedAssignment && (
                  <AiField
                    label={t('detail.suggestedAssignment')}
                    value={analysis.suggestedAssignment}
                  />
                )}
                {admin && analysis.similarTickets.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground">
                      {t('detail.similarTickets')}
                    </div>
                    {analysis.similarTickets.map((s) => (
                      <Link
                        key={s.id}
                        href={`/support/admin/${s.id}`}
                        className="block text-primary hover:underline"
                      >
                        #{s.number} — {s.subject}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
          )}

          {/* Related project */}
          {detail.relatedProject && (
            <Card className="p-4">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <FolderGit2 className="h-4 w-4" /> {t('detail.relatedProject')}
              </div>
              <div dir="auto" className="mt-1 text-sm">
                {detail.relatedProject.title}
              </div>
              <Badge variant="outline" className="mt-1.5">
                {detail.relatedProject.status}
              </Badge>
              <div className="mt-2">
                <Link
                  href="/dashboard"
                  className="text-xs text-primary hover:underline"
                >
                  {t('detail.openInDashboard')}
                </Link>
              </div>
            </Card>
          )}

          {/* Customer info (admin only) */}
          {admin && (
            <Card className="p-4">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <UserIcon className="h-4 w-4" /> {t('detail.customer')}
              </div>
              <dl className="mt-1.5 space-y-1 text-sm">
                <Row label={t('detail.name')} value={detail.customer.name} />
                <Row label={t('detail.email')} value={detail.customer.email} ltr />
                <Row label={t('detail.plan')} value={detail.customer.plan} />
                <Row label={t('detail.projects')} value={`${detail.customer.projectsCount}`} />
                <Row
                  label={t('detail.memberSince')}
                  value={new Date(detail.customer.createdAt).toLocaleDateString()}
                />
              </dl>
            </Card>
          )}

          {/* Admin controls */}
          {showAdminCard && (
            <Card className="space-y-3 p-4">
              <div className="text-sm font-semibold">{t('detail.manage')}</div>
              {caps.manage && (
                <>
                  <LabeledSelect
                    label={t('admin.colStatus')}
                    value={detail.status}
                    options={STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))}
                    onChange={(v) => adminUpdate({ status: v })}
                  />
                  <LabeledSelect
                    label={t('admin.colPriority')}
                    value={detail.priority}
                    options={PRIORITIES.map((p) => ({ value: p, label: priorityLabel(p) }))}
                    onChange={(v) => adminUpdate({ priority: v })}
                  />
                  <LabeledSelect
                    label={t('admin.colCategory')}
                    value={detail.category}
                    options={CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }))}
                    onChange={(v) => adminUpdate({ category: v })}
                  />
                </>
              )}
              {caps.assign && (
                <LabeledSelect
                  label={t('detail.assignee')}
                  value={detail.assigneeId ?? UNASSIGNED}
                  options={[
                    { value: UNASSIGNED, label: t('detail.unassigned') },
                    ...agents.map((a) => ({ value: a.id, label: a.name })),
                  ]}
                  onChange={(v) =>
                    adminUpdate({ assigneeId: v === UNASSIGNED ? null : v })
                  }
                />
              )}

              {caps.note && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground">
                  {t('detail.internalNotes')}
                </div>
                {detail.internalNotes.length > 0 && (
                  <div className="mt-1.5 space-y-1.5">
                    {detail.internalNotes.map((n) => (
                      <div
                        key={n.id}
                        dir="auto"
                        className="rounded-md border border-warning/30 bg-warning/10 p-2 text-xs"
                      >
                        <div className="font-medium">
                          {n.authorName ?? t('detail.admin')}
                        </div>
                        <div className="whitespace-pre-wrap">{n.body}</div>
                      </div>
                    ))}
                  </div>
                )}
                <Textarea
                  dir="auto"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('detail.notePlaceholder')}
                  className="mt-1.5 min-h-[60px]"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="mt-1.5"
                  onClick={addNote}
                  disabled={!note.trim()}
                >
                  {t('detail.addNote')}
                </Button>
              </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function AiField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <p dir="auto" className="mt-0.5 whitespace-pre-wrap">
        {value}
      </p>
    </div>
  );
}

function Row({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd dir={ltr ? 'ltr' : undefined} className="truncate font-medium capitalize">
        {value}
      </dd>
    </div>
  );
}

function LabeledSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-muted-foreground">{label}</div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
