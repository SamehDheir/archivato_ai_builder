'use client';

import { useState } from 'react';
import type { InterviewState } from '@archivato/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { SummaryView } from './SummaryView';

/**
 * The interview Q&A: the running conversation, the current question form
 * (while collecting), and the requirements summary + confirm gate (while
 * awaiting confirmation). Owns the local answer input.
 */
export function InterviewPanel({
  state,
  busy,
  error,
  onAnswer,
  onConfirm,
}: {
  state: InterviewState;
  busy: boolean;
  error: string | null;
  onAnswer: (text: string) => void;
  onConfirm: () => void;
}) {
  const [answer, setAnswer] = useState('');

  function submitAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim()) return;
    onAnswer(answer.trim());
    setAnswer('');
  }

  return (
    <div className="space-y-4">
      {state.history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Conversation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {state.history.map((ex, i) => (
              <div key={i} className="space-y-1.5">
                <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
                  <Badge variant="secondary" className="mb-1">
                    {ex.question.phase}
                  </Badge>
                  <div>{ex.question.prompt}</div>
                </div>
                <div className="ml-auto max-w-[85%] rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
                  {ex.answer}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {state.status === 'collecting' && state.currentQuestion && (
        <Card>
          <CardContent className="p-5">
            <form className="space-y-3" onSubmit={submitAnswer}>
              <Badge variant="secondary">{state.currentQuestion.phase}</Badge>
              <h3 className="text-base font-semibold">
                {state.currentQuestion.prompt}
              </h3>
              <Textarea
                placeholder="Type your answer…"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                autoFocus
              />
              <Button type="submit" disabled={busy || !answer.trim()}>
                {busy ? 'Sending…' : 'Answer'}
              </Button>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </form>
          </CardContent>
        </Card>
      )}

      {state.status === 'awaiting_confirmation' && state.summary && (
        <Card>
          <CardHeader>
            <CardTitle>Requirements summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Completeness reached the threshold. Review and confirm to lock the
              requirements before design begins.
            </p>
            <SummaryView summary={state.summary} />
            <div className="mt-4 flex gap-2">
              <Button variant="success" onClick={onConfirm} disabled={busy}>
                {busy ? 'Confirming…' : 'Confirm requirements'}
              </Button>
            </div>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
