import type { InterviewState } from '@archivato/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

/** The interview's live completeness + status/phase bar. */
export function ProgressPanel({ state }: { state: InterviewState }) {
  const pct = Math.round(state.completeness * 100);
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-1.5 flex justify-between text-sm">
          <span>Requirement completeness</span>
          <span>{pct}%</span>
        </div>
        <Progress value={pct} />
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>Status: {state.status.replace(/_/g, ' ')}</span>
          {state.phase && <span>Phase: {state.phase.replace(/_/g, ' ')}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
