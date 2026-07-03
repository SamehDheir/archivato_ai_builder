"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { InterviewState } from "@archivato/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { SummaryView } from "@/components/interview/SummaryView";
import { cn } from "@/lib/utils";

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
  const question = state.currentQuestion;
  // Picked options + free-text detail. The submitted answer is the picks joined
  // with any extra text — so a question can be answered by tapping, typing, or both.
  const [selected, setSelected] = useState<string[]>([]);
  const [extra, setExtra] = useState("");

  // Reset the local answer whenever the question changes.
  useEffect(() => {
    setSelected([]);
    setExtra("");
  }, [question?.id]);

  const composed = [selected.join(", "), extra.trim()]
    .filter(Boolean)
    .join(" — ");
  const canSend = !busy && composed.length > 0;

  function toggle(option: string) {
    setSelected((prev) => {
      if (prev.includes(option)) return prev.filter((o) => o !== option);
      // Single-select questions keep only the latest pick.
      return question?.multiple ? [...prev, option] : [option];
    });
  }

  function send() {
    if (!canSend) return;
    onAnswer(composed);
    setSelected([]);
    setExtra("");
  }

  function submitAnswer(e: React.FormEvent) {
    e.preventDefault();
    send();
  }

  // Cmd/Ctrl+Enter submits from the textarea (Enter alone inserts a newline).
  function onAnswerKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
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
                    <Badge
                      variant="secondary"
                      className="text-[10px] uppercase"
                    >
                      {ex.question.phase}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      Q{i + 1}
                    </span>
                  </div>
                  <div
                    dir="auto"
                    className="rounded-lg rounded-tl-sm border border-border bg-muted/40 px-3.5 py-2.5 text-sm leading-relaxed"
                  >
                    {ex.question.prompt}
                  </div>
                </div>
                {/* User answer */}
                <div className="ml-auto max-w-[88%]">
                  <div className="mb-1 text-right text-xs font-semibold text-primary">
                    You
                  </div>
                  <div
                    dir="auto"
                    className="whitespace-pre-wrap rounded-lg rounded-tr-sm border border-primary/40 bg-primary/10 px-3.5 py-2.5 text-sm leading-relaxed"
                  >
                    {ex.answer}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {state.status === "collecting" && question && (
        <Card>
          <CardContent className="p-5">
            <form className="space-y-3" onSubmit={submitAnswer}>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px] uppercase">
                  {question.phase}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Question {state.history.length + 1}
                </span>
              </div>
              <h3 dir="auto" className="text-base font-semibold leading-snug">
                {question.prompt}
              </h3>

              {question.options && question.options.length > 0 && (
                <>
                  <div className="flex flex-wrap gap-2">
                    {question.options.map((opt) => {
                      const on = selected.includes(opt);
                      return (
                        <button
                          type="button"
                          key={opt}
                          dir="auto"
                          onClick={() => toggle(opt)}
                          aria-pressed={on}
                          className={cn(
                            "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            on
                              ? "border-primary bg-primary/10 font-medium text-foreground"
                              : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-4 w-4 items-center justify-center border",
                              question.multiple ? "rounded" : "rounded-full",
                              on
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-muted-foreground/40",
                            )}
                          >
                            {on && <Check className="h-3 w-3" />}
                          </span>
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {question.multiple
                      ? "Pick any that apply — add detail below if you like."
                      : "Pick one — or add detail below."}
                  </p>
                </>
              )}

              <Textarea
                dir="auto"
                placeholder={
                  question.options && question.options.length > 0
                    ? "Add any extra detail (optional)…"
                    : "Type your answer…"
                }
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                onKeyDown={onAnswerKeyDown}
                autoFocus={!question.options?.length}
              />
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={!canSend}>
                  {busy ? "Sending…" : "Answer"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Press{" "}
                  <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px]">
                    ⌘/Ctrl+Enter
                  </kbd>{" "}
                  to send
                </span>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </form>
          </CardContent>
        </Card>
      )}

      {state.status === "awaiting_confirmation" && state.summary && (
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
                {busy ? "Confirming…" : "Confirm requirements"}
              </Button>
            </div>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
