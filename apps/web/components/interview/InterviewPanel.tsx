"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import {
  artifactTextDirection,
  askedQuestionCount,
  ARTIFACT_LANGUAGE_NAMES,
  ARTIFACT_LANGUAGES,
  INTERVIEW_MAX_QUESTIONS,
  type ArtifactLanguage,
  type InterviewState,
} from "@archivato/shared";
import { Badge } from "@/components/ui/badge";
import { InterviewTranscript } from "@/components/interview/InterviewTranscript";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { SummaryView } from "@/components/interview/SummaryView";
import { SlotReview } from "@/components/interview/SlotReview";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  onEditSlot,
  onToggleExtendedArtifacts,
  onChangeArtifactLanguage,
}: {
  state: InterviewState;
  busy: boolean;
  error: string | null;
  onAnswer: (text: string) => void;
  onConfirm: () => void;
  /** Correct a filled slot at the confirmation gate (appends to the transcript). */
  onEditSlot: (slotKey: string, value: string) => void;
  /**
   * Override the budget-derived default for the threat model + QA plan (R12).
   * Omitted ⇒ the toggle isn't shown (it's the owner's call, and only theirs).
   */
  onToggleExtendedArtifacts?: (value: boolean) => void;
  /**
   * Set the language every artifact will be generated in. Omitted ⇒ the control
   * isn't shown — same rule as the toggle above: it's the owner's call, and a
   * read-only view of a gate has no business offering it.
   */
  onChangeArtifactLanguage?: (language: ArtifactLanguage) => void;
}) {
  const { t } = useTranslation("interview");
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
            <CardTitle>{t("conversation")}</CardTitle>
          </CardHeader>
          <CardContent>
            {/*
              The same component the confirmed project's Interview tab renders.
              It also fixes a numbering bug that lived here: this list used
              `i + 1`, so pasted call notes and every slot correction were
              numbered as questions — the transcript's own version of the
              progress-counter bug that `askedQuestionCount` was introduced to
              fix.
            */}
            <InterviewTranscript history={state.history} />
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
                  {t("questionN", {
                    // Not `history.length` — the transcript also holds pasted call
                    // notes and slot-edit corrections, which are turns but not
                    // questions. Counting them made the number skip (5 → 7) and a
                    // notes-first session open at "Question 2".
                    n: askedQuestionCount(state.history) + 1,
                    max: INTERVIEW_MAX_QUESTIONS,
                  })}
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
                    {question.multiple ? t("pickMulti") : t("pickOne")}
                  </p>
                </>
              )}

              <Textarea
                dir="auto"
                placeholder={
                  question.options && question.options.length > 0
                    ? t("extraPlaceholder")
                    : t("answerPlaceholder")
                }
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                onKeyDown={onAnswerKeyDown}
                autoFocus={!question.options?.length}
              />
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={!canSend}>
                  {busy ? t("sending") : t("answer")}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {t("sendPre")}
                  <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px]">
                    ⌘/Ctrl+Enter
                  </kbd>
                  {t("sendPost")}
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
            <CardTitle>{t("summaryTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="info" className="mb-3">
              <AlertDescription>{t("summaryHelp")}</AlertDescription>
            </Alert>
            <SlotReview
              slots={state.slots ?? {}}
              openQuestions={state.openQuestions ?? []}
              busy={busy}
              onEditSlot={onEditSlot}
            />
            <div className="mt-4">
              <SummaryView summary={state.summary} />
            </div>

            {/*
              R12 — the threat model + QA plan are Pro, LLM-billed and slow, and a
              small fixed-price job rarely needs them. The default is derived from
              the stated budget; this is where the owner sees that guess and
              overrides it, before any of it is generated.
            */}
            {onToggleExtendedArtifacts && (
              <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3">
                <input
                  type="checkbox"
                  checked={state.generateExtendedArtifacts ?? true}
                  onChange={(e) => onToggleExtendedArtifacts(e.target.checked)}
                  disabled={busy}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                />
                <span>
                  <span className="text-sm font-medium">
                    {t("extended.label")}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t("extended.hint")}
                  </span>
                </span>
              </label>
            )}

            {/*
              The language every artifact will be written in.

              It sits at the gate, next to the toggle above, because this is the
              last moment before generation starts — and the language of a
              document is not something anyone wants to discover *after* paying
              for it. The default is read from the client's own words, so an
              Arabic discovery call already points at Arabic and most owners will
              never touch this; what it is really for is the case the detection
              cannot know about, where the call was in Arabic but the package goes
              to an English-reading stakeholder.

              Each option is named in its OWN language (`ARTIFACT_LANGUAGE_NAMES`,
              not i18n): someone looking for Arabic finds العربية, not the English
              word for it.
            */}
            {onChangeArtifactLanguage && (
              <div className="mt-3 rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {t("language.label")}
                  </span>
                  <div className="flex gap-1.5">
                    {ARTIFACT_LANGUAGES.map((code) => {
                      const active =
                        (state.artifactLanguage ?? "en") === code;
                      return (
                        <Button
                          key={code}
                          type="button"
                          size="sm"
                          variant={active ? "default" : "outline"}
                          disabled={busy}
                          aria-pressed={active}
                          onClick={() => onChangeArtifactLanguage(code)}
                        >
                          {/*
                            `lang` + `dir` so the endonym renders in its own
                            script's shaping and direction, whatever the
                            surrounding UI locale is.
                          */}
                          <span lang={code} dir={artifactTextDirection(code)}>
                            {ARTIFACT_LANGUAGE_NAMES[code]}
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {t("language.hint")}
                </p>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <Button variant="success" onClick={onConfirm} disabled={busy}>
                {busy ? t("confirming") : t("confirm")}
              </Button>
            </div>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
