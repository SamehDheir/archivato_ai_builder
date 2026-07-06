'use client';

import { useTranslation } from 'react-i18next';
import { Check, Lock } from 'lucide-react';
import type {
  ApiDesign,
  DatabaseDesign,
  InterviewState,
  RequirementDocument,
  ReviewReport,
  SystemDesign,
} from '@archivato/shared';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Project Wizard: a top-level progress stepper across the seven pipeline stages.
 * Each step is "done" when its artifact exists; the first not-done step is the
 * current one. Display-only (the tabs below own navigation).
 */
export function ProjectWizard({
  state,
  doc,
  design,
  dbDesign,
  apiDesign,
  review,
  onNavigate,
  isPro = true,
}: {
  state: InterviewState;
  doc: RequirementDocument | null;
  design: SystemDesign | null;
  dbDesign: DatabaseDesign | null;
  apiDesign: ApiDesign | null;
  review: ReviewReport | null;
  /** Jump to a stage tab (only wired once the interview is confirmed). The
   * `tab` strings match ProjectStages' TabKey; `undefined` steps aren't links. */
  onNavigate?: (tab: string) => void;
  /** When false, the Pro stages (API onward) show a lock + a cutline note. */
  isPro?: boolean;
}) {
  const { t } = useTranslation('project');
  const steps: {
    key: string;
    label: string;
    done: boolean;
    tab?: string;
    pro?: boolean;
  }[] = [
    { key: 'interview', label: t('wizard.steps.interview'), done: state.status === 'confirmed' },
    { key: 'requirements', label: t('wizard.steps.requirements'), done: !!doc, tab: 'requirements' },
    { key: 'architecture', label: t('wizard.steps.architecture'), done: !!design, tab: 'system' },
    { key: 'database', label: t('wizard.steps.database'), done: !!dbDesign, tab: 'database' },
    { key: 'api', label: t('wizard.steps.api'), done: !!apiDesign, tab: 'api', pro: true },
    { key: 'review', label: t('wizard.steps.review'), done: !!review, tab: 'review', pro: true },
    // Export is "ready" once the API design exists (review is optional for it).
    { key: 'export', label: t('wizard.steps.export'), done: !!apiDesign, tab: 'export', pro: true },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  // The current step is the first not-done one (-1 once everything is complete).
  const currentIndex = steps.findIndex((s) => !s.done);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t('wizard.title')}</h2>
          <span className="text-xs text-muted-foreground">
            {t('wizard.complete', { done: doneCount, total: steps.length })}
          </span>
        </div>

        <ol className="scrollbar-thin flex items-center gap-1 overflow-x-auto pb-2">
          {steps.map((step, i) => {
            const isCurrent = i === currentIndex;
            const locked = !isPro && !!step.pro && !step.done;
            const navigable =
              !!onNavigate && !!step.tab && (step.done || isCurrent);
            return (
              <li key={step.key} className="flex flex-1 items-center">
                <button
                  type="button"
                  disabled={!navigable}
                  onClick={() => navigable && onNavigate?.(step.tab as string)}
                  title={navigable ? t('wizard.goTo', { label: step.label }) : undefined}
                  className={cn(
                    'group flex min-w-0 items-center gap-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    navigable ? 'cursor-pointer' : 'cursor-default',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors',
                      // Done: green ring + green check on a transparent fill.
                      step.done && 'border-success bg-transparent text-success',
                      // Current: solid blue circle with a white step number.
                      isCurrent && !step.done && 'border-blue-500 bg-blue-500 text-white',
                      // Locked / future: filled gray chip with a lock or number.
                      !step.done && !isCurrent &&
                        'border-transparent bg-muted text-muted-foreground',
                      navigable && 'group-hover:scale-105',
                    )}
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    {step.done ? (
                      <Check className="h-4 w-4" />
                    ) : locked ? (
                      <Lock className="h-3.5 w-3.5" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span
                    className={cn(
                      'whitespace-nowrap text-sm leading-tight',
                      step.done && 'font-semibold text-success',
                      isCurrent && !step.done && 'font-semibold text-foreground',
                      !step.done && !isCurrent && 'text-muted-foreground',
                      navigable && 'group-hover:underline',
                    )}
                  >
                    {step.label}
                  </span>
                </button>
                {i < steps.length - 1 && (
                  <span className="mx-2 h-px min-w-[16px] flex-1 bg-border" />
                )}
              </li>
            );
          })}
        </ol>

        {!isPro && (
          <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3" /> {t('wizard.cutline')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
