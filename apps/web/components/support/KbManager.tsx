'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookMarked, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  SUPPORT_CATEGORIES,
  type CreateKbArticleInput,
  type KbArticle,
  type KbArticleSummary,
  type SupportCategory,
} from '@archivato/shared';
import { kbAdminApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { useConfirm } from '@/components/shared/confirm-dialog';
import { useSupportMeta } from '@/components/support/support-meta';

type Editing = { mode: 'new' } | { mode: 'edit'; article: KbArticle } | null;

/**
 * Knowledge Base manager (staff with `support:kb:manage`). Lists every article
 * incl. drafts and provides create / edit / publish / delete. The same store
 * powers the public reader and the AI deflection layer.
 */
export function KbManager() {
  const { t } = useTranslation('support');
  const { categoryLabel } = useSupportMeta();
  const toast = useToast();
  const confirm = useConfirm();
  const [articles, setArticles] = useState<KbArticleSummary[] | null>(null);
  const [editing, setEditing] = useState<Editing>(null);

  const load = useCallback(async () => {
    try {
      const r = await kbAdminApi.list();
      setArticles(r.articles);
    } catch {
      setArticles([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openEdit(id: string) {
    try {
      const article = await kbAdminApi.get(id);
      setEditing({ mode: 'edit', article });
    } catch (e) {
      toast({
        title: t('kbAdmin.loadFailed'),
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
  }

  async function remove(a: KbArticleSummary) {
    const ok = await confirm({
      title: t('kbAdmin.deleteTitle'),
      description: t('kbAdmin.deleteBody', { title: a.title }),
      confirmLabel: t('kbAdmin.delete'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await kbAdminApi.remove(a.id);
      toast({ title: t('kbAdmin.deleted'), variant: 'success' });
      void load();
    } catch (e) {
      toast({
        title: t('kbAdmin.deleteFailed'),
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
  }

  if (editing) {
    return (
      <KbArticleForm
        initial={editing.mode === 'edit' ? editing.article : null}
        onCancel={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookMarked className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">{t('kbAdmin.title')}</h2>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setEditing({ mode: 'new' })}>
          <Plus className="h-4 w-4" />
          {t('kbAdmin.new')}
        </Button>
      </div>

      {articles === null ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : articles.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {t('kbAdmin.empty')}
        </Card>
      ) : (
        <div className="space-y-2">
          {articles.map((a) => (
            <Card key={a.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1" dir="auto">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{a.title}</span>
                  {a.published ? (
                    <Badge variant="default">{t('kbAdmin.published')}</Badge>
                  ) : (
                    <Badge variant="secondary">{t('kbAdmin.draft')}</Badge>
                  )}
                  <Badge variant="outline">{categoryLabel(a.category)}</Badge>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {a.excerpt}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => openEdit(a.id)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {t('kbAdmin.edit')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => remove(a)}
                  aria-label={t('kbAdmin.delete')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function KbArticleForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: KbArticle | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation('support');
  const { categoryLabel } = useSupportMeta();
  const toast = useToast();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [category, setCategory] = useState<SupportCategory>(
    initial?.category ?? 'general',
  );
  const [keywords, setKeywords] = useState((initial?.keywords ?? []).join(', '));
  const [published, setPublished] = useState(initial?.published ?? true);
  const [saving, setSaving] = useState(false);

  const canSave = title.trim().length >= 3 && body.trim().length >= 10;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    const payload: CreateKbArticleInput = {
      title: title.trim(),
      body: body.trim(),
      category,
      keywords: keywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
      published,
    };
    try {
      if (initial) {
        await kbAdminApi.update(initial.id, payload);
      } else {
        await kbAdminApi.create(payload);
      }
      toast({ title: t('kbAdmin.saved'), variant: 'success' });
      onSaved();
    } catch (e) {
      toast({
        title: t('kbAdmin.saveFailed'),
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <h2 className="text-lg font-semibold">
        {initial ? t('kbAdmin.editTitle') : t('kbAdmin.newTitle')}
      </h2>

      <Field label={t('kbAdmin.field.title')}>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('kbAdmin.field.titlePlaceholder')}
          dir="auto"
          maxLength={200}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('kbAdmin.field.category')}>
          <Select value={category} onValueChange={(v) => setCategory(v as SupportCategory)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORT_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {categoryLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={t('kbAdmin.field.status')}>
          <Select
            value={published ? 'published' : 'draft'}
            onValueChange={(v) => setPublished(v === 'published')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="published">{t('kbAdmin.published')}</SelectItem>
              <SelectItem value="draft">{t('kbAdmin.draft')}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field
        label={t('kbAdmin.field.keywords')}
        hint={t('kbAdmin.field.keywordsHint')}
      >
        <Input
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="groq, api key, mock"
          dir="ltr"
        />
      </Field>

      <Field label={t('kbAdmin.field.body')} hint={t('kbAdmin.field.bodyHint')}>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          dir="auto"
          maxLength={20000}
        />
      </Field>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          {t('kbAdmin.cancel')}
        </Button>
        <Button onClick={save} disabled={!canSave || saving}>
          {saving ? t('kbAdmin.saving') : t('kbAdmin.save')}
        </Button>
      </div>
    </Card>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
