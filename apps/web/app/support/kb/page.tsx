'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { BookOpen, Sparkles, Search } from 'lucide-react';
import { hasPermission, type KbPublicArticle } from '@archivato/shared';
import { supportApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SupportNav } from '@/components/support/SupportNav';
import { useSupportMeta } from '@/components/support/support-meta';
import { usePageAccess, customerOnly } from '@/lib/use-page-access';

/**
 * Knowledge Base — a real, store-backed reader. Lists published articles with
 * live keyword search (server-ranked, the same scorer the AI deflection uses);
 * cards deep-link to the full article. The same articles power the AI Support
 * Assistant's pre-ticket deflection.
 */
export default function KnowledgeBasePage() {
  const { t } = useTranslation('support');
  const { categoryLabel } = useSupportMeta();
  const user = usePageAccess(customerOnly);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [articles, setArticles] = useState<KbPublicArticle[] | null>(null);

  // Debounce the query so typing doesn't hammer the endpoint.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setArticles(null);
    supportApi
      .kb(debounced)
      .then((r) => active && setArticles(r.articles))
      .catch(() => active && setArticles([]));
    return () => {
      active = false;
    };
  }, [user, debounced]);

  const canManageKb = useMemo(
    () => hasPermission(user?.permissions, 'support:kb:manage'),
    [user],
  );

  if (!user) return null;

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <SupportNav
        canManageSupport={hasPermission(user.permissions, 'support:read_all')}
        canManageKb={canManageKb}
      />

      <Card className="mb-4 border-primary/30 bg-primary/5 p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-primary" />
          {t('kb.aiBanner')}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t('kb.aiBannerBody')}</p>
        <Button asChild size="sm" className="mt-2">
          <Link href="/support/new">{t('kb.askAi')}</Link>
        </Button>
      </Card>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('kb.searchPlaceholder')}
          className="ps-9"
          aria-label={t('kb.searchPlaceholder')}
        />
      </div>

      {articles === null ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : articles.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {debounced ? t('kb.noResults', { q: debounced }) : t('kb.empty')}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {articles.map((a) => (
            <Link key={a.id} href={`/support/kb/${a.id}`} className="group">
              <Card className="h-full p-4 transition-colors group-hover:border-primary/50">
                <div className="flex items-start gap-2">
                  <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div dir="auto" className="min-w-0">
                    <h3 className="font-medium leading-snug group-hover:text-primary">
                      {a.title}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {a.excerpt}
                    </p>
                    <Badge variant="secondary" className="mt-2">
                      {categoryLabel(a.category)}
                    </Badge>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
