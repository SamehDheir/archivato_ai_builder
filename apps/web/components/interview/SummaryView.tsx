'use client';

import { useTranslation } from 'react-i18next';
import type { RequirementsSummary } from '@archivato/shared';

/** Renders the lightweight requirements preview produced at the interview gate. */
export function SummaryView({ summary }: { summary: RequirementsSummary }) {
  const { t } = useTranslation('interview');
  const sections: [string, string[] | string][] = [
    ['goal', summary.goal],
    ['users', summary.users],
    ['features', summary.features],
    ['businessRules', summary.businessRules],
    ['constraints', summary.constraints],
    ['assumptions', summary.assumptions],
  ];
  return (
    <div className="space-y-3">
      {sections.map(([key, value]) => (
        <div key={key}>
          <h4 className="mb-1 text-sm font-semibold">{t(`summary.${key}`)}</h4>
          {Array.isArray(value) ? (
            value.length ? (
              <ul className="list-disc space-y-1 ps-5 text-sm">
                {value.map((v, i) => (
                  <li key={i} dir="auto">
                    {v}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-sm text-muted-foreground">
                {t('summary.empty')}
              </span>
            )
          ) : (
            <div className="text-sm" dir="auto">
              {value}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
