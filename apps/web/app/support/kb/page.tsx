'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { BookOpen, Sparkles } from 'lucide-react';
import { hasPermission, type KbArticleRef } from '@archivato/shared';
import { supportApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SupportNav } from '@/components/support/SupportNav';
import { usePageAccess, customerOnly } from '@/lib/use-page-access';

/**
 * Knowledge Base — a placeholder listing (no CRUD yet). The same seed articles
 * power the AI Support Assistant's pre-ticket deflection.
 */
export default function KnowledgeBasePage() {
  const { t } = useTranslation('support');
  const user = usePageAccess(customerOnly);
  const [articles, setArticles] = useState<KbArticleRef[] | null>(null);

  useEffect(() => {
    if (!user) return;
    supportApi
      .kb()
      .then((r) => setArticles(r.articles))
      .catch(() => setArticles([]));
  }, [user]);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <SupportNav canManageSupport={hasPermission(user.permissions, 'support:read_all')} />

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

      <div className="grid gap-3 sm:grid-cols-2">
        {articles === null
          ? Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))
          : articles.map((a) => (
              <Card key={a.id} className="p-4">
                <div className="flex items-start gap-2">
                  <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div dir="auto">
                    <h3 className="font-medium leading-snug">
                      {t(`kbArticle.${a.id}.title`, { defaultValue: a.title })}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t(`kbArticle.${a.id}.excerpt`, { defaultValue: a.excerpt })}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        {t('kb.comingSoon')}
      </p>
    </div>
  );
}
