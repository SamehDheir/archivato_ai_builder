'use client';

import { useTranslation } from 'react-i18next';
import { AlertTriangle, ClipboardCheck } from 'lucide-react';
import {
  type BusinessAnalysis,
  type ClaimConfidence,
  type ViabilityVerdict,
} from '@archivato/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/**
 * The Business Analysis artifact.
 *
 * Two presentation rules carry the stage's honesty guarantee into the UI:
 *  - every outside-knowledge claim shows its confidence, so an `unverified`
 *    competitor can never read as an established fact;
 *  - the research checklist is rendered FIRST when anything is unverified,
 *    because a caveat below the competitor table is a caveat nobody reads.
 */
export function BusinessAnalysisView({ analysis }: { analysis: BusinessAnalysis }) {
  const { t } = useTranslation('stages');

  return (
    <div className="space-y-4">
      <VerdictCard analysis={analysis} />

      {analysis.researchChecklist.length > 0 && (
        <Card className="border-warning">
          <CardHeader className="flex flex-row flex-wrap items-center gap-2">
            <ClipboardCheck className="size-4 text-warning" aria-hidden />
            <CardTitle className="text-base">{t('business.checklist.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-sm text-muted-foreground">
              {t('business.checklist.description')}
            </p>
            <ul className="list-disc space-y-1 ps-5 text-sm">
              {analysis.researchChecklist.map((item) => (
                <li key={item} dir="auto">
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('business.problem.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Field label={t('business.problem.problem')} value={analysis.problem.problem} />
          <Field label={t('business.problem.whoHasIt')} value={analysis.problem.whoHasIt} />
          <Field
            label={t('business.problem.currentAlternative')}
            value={analysis.problem.currentAlternative}
          />
          <Field
            label={t('business.problem.costOfInaction')}
            value={analysis.problem.costOfInaction}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('business.usp.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="font-medium" dir="auto">
            {analysis.usp.statement}
          </p>
          {analysis.usp.differentiators.length > 0 && (
            <ul className="list-disc space-y-1 ps-5">
              {analysis.usp.differentiators.map((d) => (
                <li key={d} dir="auto">
                  {d}
                </li>
              ))}
            </ul>
          )}
          <Field label={t('business.usp.defensibility')} value={analysis.usp.defensibility} />
        </CardContent>
      </Card>

      {analysis.segments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('business.segments.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('business.segments.name')}</TableHead>
                  <TableHead>{t('business.segments.job')}</TableHead>
                  <TableHead>{t('business.segments.pains')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analysis.segments.map((s) => (
                  <TableRow key={s.name}>
                    <TableCell className="font-medium" dir="auto">
                      {s.name}
                      <span className="block text-xs text-muted-foreground">
                        {s.description}
                      </span>
                    </TableCell>
                    <TableCell dir="auto">{s.jobToBeDone}</TableCell>
                    <TableCell dir="auto">{s.painPoints.join('; ')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{t('business.competitors.title')}</CardTitle>
          <ConfidenceBadge confidence={analysis.market.confidence} />
        </CardHeader>
        <CardContent>
          {analysis.competitors.length === 0 ? (
            <p className="text-sm text-muted-foreground" dir="auto">
              {t('business.competitors.none')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('business.competitors.name')}</TableHead>
                  <TableHead>{t('business.competitors.positioning')}</TableHead>
                  <TableHead>{t('business.competitors.weaknesses')}</TableHead>
                  <TableHead>{t('business.competitors.confidence')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analysis.competitors.map((c) => (
                  <TableRow key={c.name}>
                    <TableCell className="font-medium" dir="auto">
                      {c.name}
                      <span className="block text-xs text-muted-foreground">{c.category}</span>
                    </TableCell>
                    <TableCell dir="auto">{c.positioning}</TableCell>
                    <TableCell dir="auto">{c.weaknesses.join('; ')}</TableCell>
                    <TableCell>
                      <ConfidenceBadge confidence={c.confidence} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('business.market.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Field label={t('business.market.size')} value={analysis.market.sizeNote} />
          <SignalList
            label={t('business.market.demand')}
            items={analysis.market.demandSignals}
          />
          <SignalList
            label={t('business.market.headwinds')}
            items={analysis.market.headwinds}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{t('business.mvp.title')}</CardTitle>
          <Badge variant={analysis.mvp.verdict === 'well-scoped' ? 'default' : 'warning'}>
            {t(`business.mvp.verdict.${analysis.mvp.verdict}`)}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p dir="auto">{analysis.mvp.reasoning}</p>
          <SignalList label={t('business.mvp.core')} items={analysis.mvp.recommendedCore} />
          <SignalList label={t('business.mvp.defer')} items={analysis.mvp.deferSuggestions} />
        </CardContent>
      </Card>
    </div>
  );
}

function VerdictCard({ analysis }: { analysis: BusinessAnalysis }) {
  const { t } = useTranslation('stages');
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="text-base">{t('business.verdict.title')}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('business.verdict.ownerOnly')}
          </p>
        </div>
        <Badge variant={verdictVariant(analysis.verdict)}>
          {t(`business.verdict.${analysis.verdict}`)}
        </Badge>
      </CardHeader>
      <CardContent>
        <p className="text-sm" dir="auto">
          {analysis.verdictRationale}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * The verdict colour is a *state*, not decoration — it maps onto the semantic
 * ladder rather than introducing a hue (R14 §2).
 */
function verdictVariant(
  verdict: ViabilityVerdict,
): 'default' | 'info' | 'warning' | 'destructive' {
  switch (verdict) {
    case 'proceed':
      // 'default' is this design system's success-toned pill (see badge.tsx).
      return 'default';
    case 'proceed-with-changes':
      return 'info';
    case 'needs-validation':
      return 'warning';
    case 'high-risk':
      return 'destructive';
  }
}

function ConfidenceBadge({ confidence }: { confidence: ClaimConfidence }) {
  const { t } = useTranslation('stages');
  const variant =
    confidence === 'stated' ? 'default' : confidence === 'inferred' ? 'info' : 'warning';
  return (
    <Badge variant={variant} className="whitespace-nowrap">
      {confidence === 'unverified' && (
        <AlertTriangle className="me-1 inline size-3" aria-hidden />
      )}
      {t(`business.confidence.${confidence}`)}
    </Badge>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <p dir="auto">{value}</p>
    </div>
  );
}

function SignalList({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <ul className="list-disc space-y-1 ps-5">
        {items.map((item) => (
          <li key={item} dir="auto">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
