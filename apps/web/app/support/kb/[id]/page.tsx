'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, LifeBuoy } from 'lucide-react';
import { hasPermission, type KbPublicArticleDetail } from '@archivato/shared';
import { supportApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SupportNav } from '@/components/support/SupportNav';
import { MessageBody } from '@/components/support/SupportNav';
import { useSupportMeta } from '@/components/support/support-meta';
import { useFormat } from '@/lib/i18n/format';
import { usePageAccess, customerOnly } from '@/lib/use-page-access';

/** A single Knowledge Base article (published only; 404 → not-found notice). */
export default function KbArticlePage() {
  const { t } = useTranslation('support');
  const { categoryLabel } = useSupportMeta();
  const format = useFormat();
  const user = usePageAccess(customerOnly);
  const params = useParams();
  const id = String(params?.id ?? '');
  const [article, setArticle] = useState<KbPublicArticleDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!user || !id) return;
    let active = true;
    supportApi
      .kbArticle(id)
      .then((a) => active && setArticle(a))
      .catch(() => active && setNotFound(true));
    return () => {
      active = false;
    };
  }, [user, id]);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <SupportNav
        canManageSupport={hasPermission(user.permissions, 'support:read_all')}
        canManageKb={hasPermission(user.permissions, 'support:kb:manage')}
      />

      <Button asChild variant="ghost" size="sm" className="mb-3 gap-1.5">
        <Link href="/support/kb">
          <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" />
          {t('kb.backToList')}
        </Link>
      </Button>

      {notFound ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">{t('kb.notFound')}</p>
        </Card>
      ) : !article ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          <Card className="p-6">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{categoryLabel(article.category)}</Badge>
              <span className="text-xs text-muted-foreground">
                {t('kb.updated', { date: format.date(article.updatedAt) })}
              </span>
            </div>
            <h1 className="text-xl font-bold" dir="auto">
              {article.title}
            </h1>
            <div className="mt-4">
              <MessageBody body={article.body} />
            </div>
          </Card>

          <Card className="mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LifeBuoy className="h-4 w-4 text-primary" />
              {t('kb.stillNeedHelp')}
            </div>
            <Button asChild size="sm">
              <Link href="/support/new">{t('kb.openTicket')}</Link>
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}
