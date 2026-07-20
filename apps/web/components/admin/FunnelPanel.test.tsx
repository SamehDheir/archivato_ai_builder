import { render, screen, waitFor } from '@testing-library/react';
import { buildFunnel, type AdminFunnel } from '@archivato/shared';
import { FunnelPanel } from './FunnelPanel';

// Chrome-only component: an identity `t` keeps the assertions on behavior.
// Interpolated values are appended so a test can still see them.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
}));

// `useFormat` reads the locale provider, which isn't mounted here.
jest.mock('@/lib/i18n/format', () => ({
  useFormat: () => ({
    number: (v: number) => String(v),
    date: (v: string) => `date(${v})`,
    dateTime: (v: string) => `dateTime(${v})`,
    relative: (v: string) => `relative(${v})`,
    usd: (v: number) => `$${v}`,
    country: (c: string) => c,
  }),
}));

const funnelMock = jest.fn();
jest.mock('@/lib/api', () => ({
  adminApi: { funnel: () => funnelMock() },
}));

const NOW = new Date('2026-07-20T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

/** A funnel built through the real derivation, so the panel can't drift from it. */
function sample(): AdminFunnel {
  return buildFunnel({
    signups: [
      { userId: 'a', signedUpAt: ago(30) },
      { userId: 'b', signedUpAt: ago(30) },
      { userId: 'c', signedUpAt: ago(30) },
      { userId: 'd', signedUpAt: ago(30) },
    ],
    reaches: [
      { userId: 'a', step: 'interview_started', at: ago(29) },
      { userId: 'b', step: 'interview_started', at: ago(29) },
      { userId: 'a', step: 'share_created', at: ago(28) },
    ],
    now: NOW,
    measurableFrom: ago(3),
  });
}

beforeEach(() => funnelMock.mockReset());

describe('FunnelPanel', () => {
  it('leads with the activation rate and its cohort', async () => {
    funnelMock.mockResolvedValue(sample());
    render(<FunnelPanel />);

    // 1 of 4 accounts sent a link inside the window.
    expect(await screen.findByText('25%')).toBeInTheDocument();
    expect(
      screen.getByText('funnel.activationDetail:1,4,7'),
    ).toBeInTheDocument();
    // The cohort rule is stated, not left implicit.
    expect(screen.getByText('funnel.cohortNote')).toBeInTheDocument();
  });

  it('renders every step, including the ones nobody reached', async () => {
    funnelMock.mockResolvedValue(sample());
    render(<FunnelPanel />);

    await screen.findByText('funnel.step.signup');
    for (const step of [
      'interview_started',
      'interview_confirmed',
      'first_artifact',
      'share_created',
      'share_viewed',
      'export',
    ]) {
      expect(screen.getByText(`funnel.step.${step}`)).toBeInTheDocument();
    }
  });

  /**
   * The honesty rule: `export` cannot be reconstructed from state, so the panel
   * has to say it undercounts rather than let the gap read as a drop-off.
   */
  it('flags the event-only step and dates the measurement', async () => {
    const funnel = sample();
    funnelMock.mockResolvedValue(funnel);
    render(<FunnelPanel />);

    expect(await screen.findByText('funnel.eventOnly')).toBeInTheDocument();
    expect(
      screen.getByText(`funnel.measurableFrom:date(${funnel.measurableFrom})`),
    ).toBeInTheDocument();
  });

  it('says so plainly when no funnel event has ever been recorded', async () => {
    funnelMock.mockResolvedValue({ ...sample(), measurableFrom: null });
    render(<FunnelPanel />);

    expect(await screen.findByText('funnel.noEvents')).toBeInTheDocument();
  });

  it('renders nothing rather than blanking the dashboard when the request fails', async () => {
    funnelMock.mockRejectedValue(new Error('boom'));
    const { container } = render(<FunnelPanel />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('shows 0% on a fresh instance instead of dividing by zero', async () => {
    funnelMock.mockResolvedValue(
      buildFunnel({ signups: [], reaches: [], now: NOW }),
    );
    render(<FunnelPanel />);

    expect(await screen.findByText('0%')).toBeInTheDocument();
  });
});
