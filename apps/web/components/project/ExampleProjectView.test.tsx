import { render, screen } from '@testing-library/react';
import { validateEntityCoverage } from '@archivato/shared';
import { ExampleProjectView } from './ExampleProjectView';
import { SummaryView } from '@/components/interview/SummaryView';
import { RequirementDocumentView } from '@/components/design/RequirementDocumentView';
import { SystemDesignView } from '@/components/design/SystemDesignView';
import { DatabaseDesignView } from '@/components/design/DatabaseDesignView';
import { ApiDesignView } from '@/components/design/ApiDesignView';
import { ReviewView } from '@/components/review/ReviewView';
import { ProductVisionView } from '@/components/product/ProductVisionView';
import { RoadmapView } from '@/components/roadmap/RoadmapView';
import { CostView } from '@/components/cost/CostView';
import { ThreatModelView } from '@/components/security/ThreatModelView';
import { QaPlanView } from '@/components/qa/QaPlanView';
import { ToastProvider } from '@/components/shared/toast';
import { ThemeProvider } from '@/components/shared/theme';
import {
  EXAMPLE_API_DESIGN,
  EXAMPLE_COST_ESTIMATE,
  EXAMPLE_DATABASE_DESIGN,
  EXAMPLE_QA_PLAN,
  EXAMPLE_REQUIREMENTS,
  EXAMPLE_REVIEW,
  EXAMPLE_ROADMAP,
  EXAMPLE_SUMMARY,
  EXAMPLE_SYSTEM_DESIGN,
  EXAMPLE_THREAT_MODEL,
  EXAMPLE_VISION,
} from '@/lib/example-project';

// Identity `t` so assertions can match on i18n keys + rendered fixture data.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// `useFormat` (used by the Vision + Cost views) reads the active locale from
// LocaleProvider, which we can't mount here because react-i18next is mocked.
// Stubbing the locale keeps the real `Intl` formatting path under test.
jest.mock('@/components/shared/i18n', () => ({
  useLocale: () => ({ locale: 'en', setLocale: () => {} }),
}));

describe('ExampleProjectView', () => {
  it('renders the read-only sample through the real artifact views', () => {
    render(<ExampleProjectView onClose={() => {}} onStartOwn={() => {}} />);

    // Chrome: the "Example" badge + the start-own / close CTAs.
    expect(screen.getByText('example.badge')).toBeInTheDocument();
    expect(screen.getByText('example.startOwn')).toBeInTheDocument();
    expect(screen.getByText('example.close')).toBeInTheDocument();

    // The default (Interview summary) tab renders fixture content, which proves
    // the static artifact shape is accepted by SummaryView without throwing.
    expect(
      screen.getByText(/book vetted home-services professionals/i),
    ).toBeInTheDocument();

    // Every agent gets a tab — the design chain plus the standalone stages.
    for (const tab of [
      'summary',
      'vision',
      'requirements',
      'system',
      'database',
      'api',
      'review',
      'roadmap',
      'cost',
      'threat',
      'qa',
    ]) {
      expect(screen.getByText(`example.tab.${tab}`)).toBeInTheDocument();
    }
  });

  it('fires the callbacks from the header actions', () => {
    const onClose = jest.fn();
    const onStartOwn = jest.fn();
    render(<ExampleProjectView onClose={onClose} onStartOwn={onStartOwn} />);

    screen.getByText('example.startOwn').click();
    screen.getByText('example.close').click();

    expect(onStartOwn).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Radix Tabs only mounts the active tab's content, so render each artifact
  // view directly to prove every static fixture shape is valid end-to-end.
  it('renders every artifact fixture without throwing', () => {
    expect(() =>
      render(
        <ThemeProvider>
          <ToastProvider>
            <SummaryView summary={EXAMPLE_SUMMARY} />
            <ProductVisionView vision={EXAMPLE_VISION} />
            <RequirementDocumentView doc={EXAMPLE_REQUIREMENTS} />
            <SystemDesignView design={EXAMPLE_SYSTEM_DESIGN} interactive={false} />
            <DatabaseDesignView design={EXAMPLE_DATABASE_DESIGN} />
            <ApiDesignView design={EXAMPLE_API_DESIGN} />
            <ReviewView report={EXAMPLE_REVIEW} />
            <RoadmapView roadmap={EXAMPLE_ROADMAP} />
            <CostView estimate={EXAMPLE_COST_ESTIMATE} />
            <ThreatModelView model={EXAMPLE_THREAT_MODEL} />
            <QaPlanView plan={EXAMPLE_QA_PLAN} />
          </ToastProvider>
        </ThemeProvider>,
      ),
    ).not.toThrow();
  });

  // The cost figures are derived from the design by the same pure `estimateCosts`
  // the real stage uses — so the example can never drift from its own fixtures.
  it('derives the cost estimate from the example design', () => {
    expect(EXAMPLE_COST_ESTIMATE.workload).toMatchObject({
      services: EXAMPLE_SYSTEM_DESIGN.services.length,
      entities: EXAMPLE_DATABASE_DESIGN.entities.length,
      endpoints: EXAMPLE_API_DESIGN.modules.reduce(
        (n, m) => n + m.endpoints.length,
        0,
      ),
    });
    expect(EXAMPLE_COST_ESTIMATE.providers.length).toBeGreaterThan(0);
    expect(EXAMPLE_COST_ESTIMATE.recommended).toBeTruthy();
  });

  // The example is what a good design looks like, so it has to satisfy the rule
  // the real stage enforces: no entity without an API or a stated reason. It used
  // to ship `users` and `payments` with no endpoints at all — the very bug the
  // coverage guarantee exists to prevent, on the page selling the product.
  it('gives every example entity an API', () => {
    const result = validateEntityCoverage(
      EXAMPLE_API_DESIGN,
      EXAMPLE_DATABASE_DESIGN.entities.map((e) => e.name),
    );
    expect(result.missing).toEqual([]);
    expect(result.ok).toBe(true);
  });

  // Every STRIDE category must be represented, mirroring the real agent's
  // `normalize()` guarantee — otherwise the Security tab would look incomplete.
  it('covers every STRIDE category in the threat model', () => {
    const covered = new Set(EXAMPLE_THREAT_MODEL.threats.map((x) => x.category));
    expect([...covered].sort()).toEqual(
      [
        'denial_of_service',
        'elevation_of_privilege',
        'information_disclosure',
        'repudiation',
        'spoofing',
        'tampering',
      ].sort(),
    );
  });
});
