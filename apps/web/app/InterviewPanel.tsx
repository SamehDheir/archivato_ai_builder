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

  function send() {
    if (busy || !answer.trim()) return;
    onAnswer(answer.trim());
    setAnswer('');
  }

  function submitAnswer(e: React.FormEvent) {
    e.preventDefault();
    send();
  }

  // Cmd/Ctrl+Enter submits from the textarea (Enter alone inserts a newline).
  function onAnswerKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="space-y-4">
      {state.history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Conversation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {state.history.map((ex, i) => (
              <div key={i} className="space-y-2">
                {/* Interviewer question */}
                <div className="max-w-[88%]">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Interviewer
                    </span>
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      {ex.question.phase}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      Q{i + 1}
                    </span>
                  </div>
                  <div className="rounded-lg rounded-tl-sm border border-border bg-muted/40 px-3.5 py-2.5 text-sm leading-relaxed">
                    {ex.question.prompt}
                  </div>
                </div>
                {/* User answer */}
                <div className="ml-auto max-w-[88%]">
                  <div className="mb-1 text-right text-xs font-semibold text-primary">
                    You
                  </div>
                  <div className="whitespace-pre-wrap rounded-lg rounded-tr-sm border border-primary/40 bg-primary/10 px-3.5 py-2.5 text-sm leading-relaxed">
                    {ex.answer}
                  </div>
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
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px] uppercase">
                  {state.currentQuestion.phase}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Question {state.history.length + 1}
                </span>
              </div>
              <h3 className="text-base font-semibold leading-snug">
                {state.currentQuestion.prompt}
              </h3>
              <Textarea
                placeholder="Type your answer…"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={onAnswerKeyDown}
                autoFocus
              />
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={busy || !answer.trim()}>
                  {busy ? 'Sending…' : 'Answer'}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Press{' '}
                  <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px]">
                    ⌘/Ctrl+Enter
                  </kbd>{' '}
                  to send
                </span>
              </div>
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
