'use client';

import { useTranslation } from 'react-i18next';
import { Target, Wrench, Ban } from 'lucide-react';
import {
  TEST_TYPES,
  type QaPlan,
  type TestPriority,
  type TestSuite,
} from '@archivato/shared';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { DownloadButton } from '@/components/shared/DownloadButton';
import { Section } from '@/components/design/RequirementDocumentView';

const PRIORITY_CLASS: Record<TestPriority, string> = {
  high: 'text-destructive border-destructive/40',
  medium: 'text-warning border-warning/40',
  low: 'text-muted-foreground border-border',
};

const PRIORITY_RANK: Record<TestPriority, number> = { high: 0, medium: 1, low: 2 };

export function QaPlanView({ plan }: { plan: QaPlan }) {
  const { t } = useTranslation('stages');
  const suites = plan.suites ?? [];
  const totalCases = suites.reduce((n, s) => n + s.cases.length, 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t('qa.generated_at', {
            date: new Date(plan.generatedAt).toLocaleString(),
          })}
        </p>
        <DownloadButton
          filename={`qa-plan-${plan.sessionId}.json`}
          data={plan}
          label={t('qa.download')}
        />
      </div>

      <p className="text-sm text-muted-foreground" dir="auto">
        {plan.summary}
      </p>

      {/* Per-type tally */}
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="primary">{t('qa.totalCases', { n: totalCases })}</Badge>
        {TEST_TYPES.map(({ type, title }) => {
          const n = suites
            .filter((s) => s.type === type)
            .reduce((a, s) => a + s.cases.length, 0);
          if (!n) return null;
          return (
            <Badge variant="secondary" key={type}>
              {t(`qa.type.${type}`, { defaultValue: title })}: {n}
            </Badge>
          );
        })}
      </div>

      <Section title={t('qa.strategy')} count={undefined}>
        <ul className="list-disc space-y-1 ps-5 text-sm" dir="auto">
          {(plan.strategy ?? []).map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </Section>

      {/* Suites in canonical test-type order */}
      {TEST_TYPES.map(({ type, title }) => {
        const typeSuites = suites.filter((s) => s.type === type);
        if (!typeSuites.length) return null;
        return (
          <Section
            key={type}
            title={t(`qa.type.${type}`, { defaultValue: title })}
            count={typeSuites.reduce((n, s) => n + s.cases.length, 0)}
          >
            <div className="space-y-3">
              {typeSuites.map((suite, i) => (
                <SuiteCard key={i} suite={suite} />
              ))}
            </div>
          </Section>
        );
      })}

      <Section title={t('qa.coverageGoals')} icon={Target}>
        <ul className="list-disc space-y-1 ps-5 text-sm" dir="auto">
          {(plan.coverageGoals ?? []).map((g, i) => (
            <li key={i}>{g}</li>
          ))}
        </ul>
      </Section>

      <Section title={t('qa.tooling')} icon={Wrench}>
        <ul className="list-disc space-y-1 ps-5 text-sm" dir="auto">
          {(plan.tooling ?? []).map((tool, i) => (
            <li key={i}>{tool}</li>
          ))}
        </ul>
      </Section>

      <Section title={t('qa.outOfScope')} icon={Ban}>
        <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground" dir="auto">
          {(plan.outOfScope ?? []).map((o, i) => (
            <li key={i}>{o}</li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function SuiteCard({ suite }: { suite: TestSuite }) {
  const { t } = useTranslation('stages');
  const cases = [...suite.cases].sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  );
  return (
    <div className="rounded-lg border border-border bg-card p-3" dir="auto">
      <div className="font-medium">{suite.name}</div>
      {suite.objective && (
        <p className="mt-0.5 text-xs text-muted-foreground">{suite.objective}</p>
      )}
      <ul className="mt-2 space-y-1.5">
        {cases.map((c) => (
          <li key={c.id} className="flex gap-2 text-sm">
            <span className="mt-0.5 font-mono text-xs text-muted-foreground">
              {c.id}
            </span>
            <span
              className={cn(
                'mt-0.5 h-fit rounded border px-1 py-0.5 text-[9px] font-semibold uppercase',
                PRIORITY_CLASS[c.priority],
              )}
            >
              {t(`qa.priority.${c.priority}`, { defaultValue: c.priority })}
            </span>
            <span className="flex-1">
              {c.title}
              <span className="text-muted-foreground"> → {c.expected}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
