import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { normalizeReviewReport, type ReviewReport } from '@archivato/shared';
import { ReviewView } from './ReviewView';

// Chrome-only assertions: an identity `t` keeps them on behavior, not copy.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const proposeFix = jest.fn();
const fetchFixLog = jest.fn();
jest.mock('@/lib/api', () => ({
  reviewApi: {
    proposeFix: (...args: unknown[]) => proposeFix(...args),
    // The view loads the existing log on mount (it lives on the session, so it
    // outlives the report and can't just be accumulated from this page's actions).
    fixLog: (...args: unknown[]) => fetchFixLog(...args),
    applyFix: jest.fn(),
    addClientQuestion: jest.fn(),
    addOutOfScope: jest.fn(),
    resolveAdvisory: jest.fn(),
  },
}));

const report: ReviewReport = normalizeReviewReport({
  sessionId: 's1',
  generatedAt: '2026-01-02T00:00:00.000Z',
  overallScore: 60,
  scores: { security: 60, scalability: 60, performance: 60, cost: 60 },
  scalabilityScore: 60,
  summary: 'ok',
  securityIssues: [
    { title: 'No encryption stated', detail: 'Add an NFR.', severity: 'high' },
  ],
  scalabilityIssues: [],
  performanceRisks: [],
  costOptimizations: [],
  missingFeatures: [],
  recommendations: [],
} as unknown as ReviewReport);

describe('ReviewView', () => {
  beforeEach(() => {
    proposeFix.mockReset();
    fetchFixLog.mockReset();
    fetchFixLog.mockResolvedValue([]);
  });

  it('renders the findings read-only when there is no session', () => {
    // How the public share page and the read-only example project mount it. The
    // fix actions call owner-scoped APIs, so they must not be offered here.
    render(<ReviewView report={report} />);

    // Twice over: once in its section, once in the Critical Issues callout (it's
    // a `high`), which is exactly the pre-R11 behaviour this must not change.
    expect(screen.getAllByText('No encryption stated')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'review.fix.propose' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText('review.fix.status.open')).toBeNull();
  });

  it('offers the fix actions to the owner', () => {
    render(<ReviewView report={report} sessionId="s1" onFixApplied={jest.fn()} />);

    expect(
      screen.getByRole('button', { name: 'review.fix.propose' }),
    ).toBeInTheDocument();
    expect(screen.getByText('review.fix.status.open')).toBeInTheDocument();
  });

  it('drafts a fix without applying anything until the owner approves', async () => {
    // The no-silent-fix rule, at the UI seam: clicking Propose must only ever
    // reach `proposeFix` (which writes nothing) — never an apply.
    proposeFix.mockResolvedValue({ findingIds: ['security:0'], sections: [] });
    render(<ReviewView report={report} sessionId="s1" onFixApplied={jest.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'review.fix.propose' }));

    expect(proposeFix).toHaveBeenCalledWith('s1', ['security:0']);
  });

  it('loads the existing fix log on mount, not just this session\'s actions', async () => {
    // The log lives on the session so it survives a review re-run and a version
    // restore. If it were only accumulated from actions taken here, an owner
    // returning to the page would see no history at all.
    fetchFixLog.mockResolvedValue([
      {
        findingId: 'security:0',
        findingTitle: 'No encryption stated',
        action: 'patch_applied',
        artifactsTouched: ['requirements'],
        at: '2026-01-03T00:00:00.000Z',
      },
    ]);
    render(<ReviewView report={report} sessionId="s1" onFixApplied={jest.fn()} />);

    expect(fetchFixLog).toHaveBeenCalledWith('s1');
    expect(await screen.findByText('review.fix.log.title')).toBeInTheDocument();
  });

  it('never fetches the fix log without a session', () => {
    render(<ReviewView report={report} />);
    expect(fetchFixLog).not.toHaveBeenCalled();
  });

  it('hides the actions once a finding is resolved', () => {
    const resolved = normalizeReviewReport({
      ...report,
      securityIssues: [{ ...report.securityIssues[0], status: 'resolved' }],
    });
    render(<ReviewView report={resolved} sessionId="s1" onFixApplied={jest.fn()} />);

    expect(screen.getByText('review.fix.status.resolved')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'review.fix.propose' })).toBeNull();
  });
});
