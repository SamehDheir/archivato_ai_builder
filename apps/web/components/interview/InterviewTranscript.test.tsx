import { render, screen } from '@testing-library/react';
import {
  CORRECTION_ENTRY_PREFIX,
  NOTES_ENTRY_ID,
  type InterviewExchange,
} from '@archivato/shared';
import { InterviewTranscript } from './InterviewTranscript';

// Chrome-only labels; an identity `t` keeps the assertions on behavior. It also
// makes the interpolated question number visible as `qShort` + the raw options,
// so the numbering assertions below read the value rather than a translation.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && 'n' in opts ? `${key}:${opts.n}` : key,
  }),
}));

const asked = (id: string, prompt: string, answer: string): InterviewExchange => ({
  question: { id, phase: 'understanding', prompt } as InterviewExchange['question'],
  answer,
});

const notes = (answer: string): InterviewExchange => ({
  question: {
    id: NOTES_ENTRY_ID,
    phase: 'understanding',
    // The machine-composed prompt the server stores. It must never be rendered.
    prompt: 'Call notes / meeting transcript provided by the user.',
  } as InterviewExchange['question'],
  answer,
});

const correction = (slotKey: string, answer: string): InterviewExchange => ({
  question: {
    id: `${CORRECTION_ENTRY_PREFIX}${slotKey}`,
    phase: 'understanding',
    prompt: `Correction — ${slotKey}`,
  } as InterviewExchange['question'],
  answer,
});

describe('InterviewTranscript', () => {
  it('numbers only the questions that were actually asked', () => {
    render(
      <InterviewTranscript
        history={[
          notes('Client called about a clinic booking system.'),
          asked('q1', 'What is the business domain?', 'Healthcare'),
          correction('timeline', 'Six weeks'),
          asked('q2', 'Who uses it?', 'Doctors and patients'),
        ]}
      />,
    );

    // Two asked questions ⇒ Q1 and Q2, with the notes and the correction between
    // them taking no number. Numbering by array index would have made these Q2
    // and Q4 — attributing the owner's own correction to the interviewer.
    expect(screen.getByText('qShort:1')).toBeInTheDocument();
    expect(screen.getByText('qShort:2')).toBeInTheDocument();
    expect(screen.queryByText('qShort:3')).not.toBeInTheDocument();
    expect(screen.queryByText('qShort:4')).not.toBeInTheDocument();
  });

  it('shows pasted call notes without their machine-composed prompt', () => {
    render(
      <InterviewTranscript
        history={[notes('Client called about a clinic booking system.')]}
      />,
    );

    expect(screen.getByText('transcript.notes')).toBeInTheDocument();
    expect(
      screen.getByText('Client called about a clinic booking system.'),
    ).toBeInTheDocument();
    // The stored prompt is English server text; printing it would drop an English
    // label into an otherwise Arabic transcript.
    expect(
      screen.queryByText(/Call notes \/ meeting transcript/),
    ).not.toBeInTheDocument();
  });

  it('labels a slot correction and names the slot it corrected', () => {
    render(<InterviewTranscript history={[correction('timeline', 'Six weeks')]} />);

    expect(screen.getByText('transcript.correction')).toBeInTheDocument();
    expect(screen.getByText('slot.timeline')).toBeInTheDocument();
    expect(screen.getByText('Six weeks')).toBeInTheDocument();
    // Never rendered as a question, and never numbered.
    expect(screen.queryByText('qShort:1')).not.toBeInTheDocument();
  });

  it('falls back to the bare label when the corrected slot is unrecognized', () => {
    render(
      <InterviewTranscript history={[correction('not_a_real_slot', 'value')]} />,
    );

    expect(screen.getByText('transcript.correction')).toBeInTheDocument();
    // A raw `slot.not_a_real_slot` on screen is the bug the guard prevents, and
    // `check-i18n` cannot catch it because the key is built at runtime.
    expect(screen.queryByText(/slot\./)).not.toBeInTheDocument();
  });

  it('says so when there is no transcript at all', () => {
    render(<InterviewTranscript history={[]} />);
    expect(screen.getByText('transcript.empty')).toBeInTheDocument();
  });
});
