'use client';

import { useTranslation } from 'react-i18next';
import {
  CORRECTION_ENTRY_PREFIX,
  isAskedQuestion,
  NOTES_ENTRY_ID,
  SLOT_KEYS,
  type InterviewExchange,
} from '@archivato/shared';
import { Badge } from '@/components/ui/badge';

/**
 * The discovery conversation, rendered as a transcript.
 *
 * Shared by the live interview (where it is the running conversation) and the
 * confirmed project's **Interview** tab (where it is the record). One component
 * rather than two, because it is one thing: the client's own words, which is the
 * artifact every other artifact is derived from and the one an owner goes back to
 * when a client disputes what was agreed.
 *
 * **`history[]` is not a list of questions.** It is the transcript, and it also
 * carries pasted call notes (entry 0, notes-first mode) and a correction turn for
 * every slot the owner edited at the gate — both deliberately, because the
 * transcript is the source of truth and anything that informs the slots has to be
 * in it. Rendering all three as "Question N" is the same mistake the progress
 * counter used to make: it numbered notes and corrections as questions, so the
 * count jumped and could exceed the cap, and the interview looked like it had
 * lost track of itself. Here it would be worse — it would attribute the owner's
 * own correction to the interviewer as a question the client answered.
 *
 * So each turn is classified by `isAskedQuestion` (the shared predicate, so this
 * cannot drift from the counter) and only real questions take a number.
 */
export function InterviewTranscript({
  history,
}: {
  history: InterviewExchange[];
}) {
  const { t } = useTranslation('interview');

  if (history.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t('transcript.empty')}</p>
    );
  }

  // Counts only asked questions, so the numbering matches what the interview
  // actually asked rather than the array index.
  let asked = 0;

  return (
    <div className="space-y-5">
      {history.map((entry, i) => {
        if (!isAskedQuestion(entry)) {
          return <AsideTurn key={i} entry={entry} />;
        }
        asked += 1;
        return <QuestionTurn key={i} entry={entry} n={asked} />;
      })}
    </div>
  );
}

/** One asked question and the answer it got. */
function QuestionTurn({
  entry,
  n,
}: {
  entry: InterviewExchange;
  n: number;
}) {
  const { t } = useTranslation('interview');

  return (
    <div className="space-y-2">
      <div className="max-w-[88%]">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">
            {t('interviewer')}
          </span>
          <Badge variant="secondary" className="text-[10px] uppercase">
            {entry.question.phase}
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            {t('qShort', { n })}
          </span>
        </div>
        {/* `rounded-ss-sm` — the squared corner is the bubble's tail, so it sits
            on the reading-leading edge and flips in Arabic. */}
        <div
          dir="auto"
          className="rounded-lg rounded-ss-sm border border-border bg-muted/40 px-3.5 py-2.5 text-sm leading-relaxed"
        >
          {entry.question.prompt}
        </div>
      </div>
      <div className="ms-auto max-w-[88%]">
        <div className="mb-1 text-end text-xs font-semibold text-primary">
          {t('you')}
        </div>
        <div
          dir="auto"
          className="whitespace-pre-wrap rounded-lg rounded-se-sm border border-primary/40 bg-primary/10 px-3.5 py-2.5 text-sm leading-relaxed"
        >
          {entry.answer}
        </div>
      </div>
    </div>
  );
}

/**
 * A turn that is in the transcript but was never asked: pasted call notes, or a
 * correction the owner made at the gate.
 *
 * Rendered full-width and unbubbled so it reads as a note about the conversation
 * rather than a line in it — and, critically, **the stored prompt is not shown**.
 * Those prompts are machine text composed server-side in English ("Correction —
 * <slot description>"), so printing them would drop an English label into an
 * otherwise Arabic transcript. The label comes from i18n instead, and a
 * correction names its slot through the same `slot.*` keys the gate uses.
 */
function AsideTurn({ entry }: { entry: InterviewExchange }) {
  const { t } = useTranslation('interview');
  const isNotes = entry.question.id === NOTES_ENTRY_ID;
  const slotKey = entry.question.id.slice(CORRECTION_ENTRY_PREFIX.length);
  // Guard the lookup: a `slot.*` key that does not exist renders as the raw key,
  // which is exactly the failure `check-i18n` exists to catch — and it could not
  // catch this one, because the key is built at runtime. An unrecognized slot
  // falls back to the bare "Correction" label, which is true either way.
  const named = !isNotes && (SLOT_KEYS as readonly string[]).includes(slotKey);

  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3.5 py-2.5">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground">
          {isNotes ? t('transcript.notes') : t('transcript.correction')}
        </span>
        {named && (
          <Badge variant="outline" className="text-[10px]">
            {t(`slot.${slotKey}`)}
          </Badge>
        )}
      </div>
      <div
        dir="auto"
        className="whitespace-pre-wrap text-sm leading-relaxed text-foreground"
      >
        {entry.answer}
      </div>
    </div>
  );
}
