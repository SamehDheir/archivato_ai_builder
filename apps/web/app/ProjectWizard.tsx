'use client';

import { Check } from 'lucide-react';
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
}) {
  const steps: { label: string; done: boolean; tab?: string }[] = [
    { label: 'Interview', done: state.status === 'confirmed' },
    { label: 'Requirements', done: !!doc, tab: 'requirements' },
    { label: 'Architecture', done: !!design, tab: 'system' },
    { label: 'Database', done: !!dbDesign, tab: 'database' },
    { label: 'API', done: !!apiDesign, tab: 'api' },
    { label: 'Review', done: !!review, tab: 'review' },
    // Export is "ready" once the API design exists (review is optional for it).
    { label: 'Export', done: !!apiDesign, tab: 'export' },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  // The current step is the first not-done one (-1 once everything is complete).
  const currentIndex = steps.findIndex((s) => !s.done);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Project Wizard</h2>
          <span className="text-xs text-muted-foreground">
            {doneCount}/{steps.length} complete
          </span>
        </div>

        <ol className="flex items-start gap-1 overflow-x-auto pb-1">
          {steps.map((step, i) => {
            const isCurrent = i === currentIndex;
            const navigable =
              !!onNavigate && !!step.tab && (step.done || isCurrent);
            return (
              <li key={step.label} className="flex flex-1 items-start">
                <button
                  type="button"
                  disabled={!navigable}
                  onClick={() => navigable && onNavigate?.(step.tab as string)}
                  title={navigable ? `Go to ${step.label}` : undefined}
                  className={cn(
                    'flex min-w-0 flex-col items-center gap-1.5',
                    navigable
                      ? 'cursor-pointer'
                      : 'cursor-default',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors',
                      step.done &&
                        'border-primary bg-primary text-primary-foreground',
                      isCurrent &&
                        !step.done &&
                        'border-primary text-primary ring-2 ring-primary/30',
                      !step.done &&
                        !isCurrent &&
                        'border-border text-muted-foreground',
                      navigable && 'group-hover:opacity-90 hover:scale-105',
                    )}
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    {step.done ? <Check className="h-4 w-4" /> : i + 1}
                  </span>
                  <span
                    className={cn(
                      'whitespace-nowrap text-[11px] leading-tight',
                      step.done || isCurrent
                        ? 'font-medium text-foreground'
                        : 'text-muted-foreground',
                      navigable && 'hover:underline',
                    )}
                  >
                    {step.label}
                  </span>
                </button>
                {i < steps.length - 1 && (
                  <span
                    className={cn(
                      'mx-1 mt-4 h-px min-w-[12px] flex-1',
                      step.done ? 'bg-primary' : 'bg-border',
                    )}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
