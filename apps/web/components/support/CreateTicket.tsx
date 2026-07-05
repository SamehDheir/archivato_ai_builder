'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sparkles, Loader2, CheckCircle2, BookOpen, LifeBuoy } from 'lucide-react';
import type {
  ProjectSummary,
  SupportCategory,
  SupportDeflectionResult,
  SupportPriority,
} from '@archivato/shared';
import { interviewApi, supportApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/shared/toast';
import {
  CATEGORIES,
  PRIORITIES,
  useSupportMeta,
} from '@/components/support/support-meta';

const NONE = 'none';

/**
 * Create-ticket form with the **pre-ticket AI deflection** layer up top: the
 * user describes the problem, the AI tries to solve it (KB + their past
 * tickets), and only if that doesn't help do they file a ticket.
 */
export function CreateTicket() {
  const router = useRouter();
  const toast = useToast();
  const { t, categoryLabel, priorityLabel } = useSupportMeta();

  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<SupportCategory>('technical');
  const [priority, setPriority] = useState<SupportPriority>('medium');
  const [sessionId, setSessionId] = useState<string>(NONE);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);

  const [deflecting, setDeflecting] = useState(false);
  const [deflection, setDeflection] = useState<SupportDeflectionResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    interviewApi
      .list()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  async function askAi() {
    if (description.trim().length < 5) {
      toast({ title: t('create.describeFirst'), variant: 'error' });
      return;
    }
    setDeflecting(true);
    setDeflection(null);
    try {
      const result = await supportApi.deflect({
        message: description,
        sessionId: sessionId === NONE ? undefined : sessionId,
      });
      setDeflection(result);
      // Pre-fill category/priority from the AI's read of the issue.
      setCategory(result.suggestedCategory);
      setPriority(result.suggestedPriority);
    } catch (e) {
      toast({
        title: t('create.aiUnavailable'),
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setDeflecting(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const detail = await supportApi.create({
        subject,
        description,
        category,
        priority,
        sessionId: sessionId === NONE ? undefined : sessionId,
      });
      toast({ title: t('create.created', { number: detail.number }), variant: 'success' });
      router.push(`/support/${detail.id}`);
    } catch (err) {
      toast({
        title: t('create.createFailed'),
        description: err instanceof Error ? err.message : String(err),
        variant: 'error',
      });
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Pre-ticket AI deflection */}
      <Card className="border-primary/30 bg-primary/5 p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">{t('create.aiTitle')}</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t('create.aiSubtitle')}</p>
        <Textarea
          dir="auto"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('create.aiPlaceholder')}
          className="mt-3 min-h-[96px]"
        />
        <div className="mt-3 flex items-center gap-2">
          <Button type="button" onClick={askAi} disabled={deflecting}>
            {deflecting ? (
              <Loader2 className="me-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="me-1.5 h-4 w-4" />
            )}
            {t('create.askAi')}
          </Button>
          {deflection && (
            <span className="text-xs text-muted-foreground">
              {t('create.confidence', {
                percent: Math.round(deflection.confidence * 100),
              })}
            </span>
          )}
        </div>

        {deflection && (
          <div className="mt-4 space-y-3">
            <div className="rounded-md border border-border bg-background p-3">
              {deflection.solved && (
                <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-success">
                  <CheckCircle2 className="h-4 w-4" /> {t('create.suggestedSolution')}
                </div>
              )}
              <p dir="auto" className="whitespace-pre-wrap text-sm leading-relaxed">
                {deflection.answer}
              </p>
            </div>

            {deflection.quickFixes.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground">
                  {t('create.quickFixes')}
                </div>
                <ul className="mt-1 list-disc space-y-0.5 ps-5 text-sm">
                  {deflection.quickFixes.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}

            {deflection.articles.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground">
                  {t('create.articles')}
                </div>
                <div className="mt-1 space-y-1">
                  {deflection.articles.map((a) => (
                    <div key={a.id} dir="auto" className="flex items-start gap-1.5 text-sm">
                      <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>
                        <span className="font-medium">
                          {t(`kbArticle.${a.id}.title`, { defaultValue: a.title })}
                        </span>{' '}
                        —{' '}
                        <span className="text-muted-foreground">
                          {t(`kbArticle.${a.id}.excerpt`, { defaultValue: a.excerpt })}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {deflection.similarTickets.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground">
                  {t('create.similar')}
                </div>
                <div className="mt-1 space-y-1">
                  {deflection.similarTickets.map((s) => (
                    <Link
                      key={s.id}
                      href={`/support/${s.id}`}
                      className="block text-sm text-primary hover:underline"
                    >
                      #{s.number} — {s.subject}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              {deflection.solved ? t('create.solvedHint') : t('create.unsolvedHint')}
            </p>
          </div>
        )}
      </Card>

      {/* Ticket form */}
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-2">
          <LifeBuoy className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">{t('create.formTitle')}</h2>
        </div>

        <div>
          <Label htmlFor="subject">{t('create.subject')}</Label>
          <Input
            id="subject"
            dir="auto"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t('create.subjectPlaceholder')}
            required
            minLength={3}
            maxLength={160}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>{t('create.category')}</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as SupportCategory)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {categoryLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t('create.priority')}</Label>
            <Select
              value={priority}
              onValueChange={(v) => setPriority(v as SupportPriority)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {priorityLabel(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {projects.length > 0 && (
          <div>
            <Label>{t('create.relatedProject')}</Label>
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('create.none')}</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.sessionId} value={p.sessionId}>
                    {p.title || p.idea}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <Label htmlFor="desc">{t('create.description')}</Label>
          <Textarea
            id="desc"
            dir="auto"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('create.descriptionPlaceholder')}
            className="min-h-[120px]"
            required
            minLength={10}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {t('create.descriptionTip')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="me-1.5 h-4 w-4 animate-spin" />}
            {t('create.submit')}
          </Button>
          <Button type="button" variant="ghost" asChild>
            <Link href="/support">{t('create.cancel')}</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
