import type { ComponentProps } from 'react';
import { render, screen, within } from '@testing-library/react';
import { ProjectStages } from './ProjectStages';

/**
 * The stage rail's grouping.
 *
 * Eighteen stages used to render as one flat 224px column. The phase boundaries
 * that make it scannable — the source, the deal, the build, assurance, handoff —
 * existed only as comments in the source, so the owner had to hold the whole
 * pipeline in their head to find anything.
 *
 * What these tests defend is that surfacing those seams stayed *presentational*:
 * every stage still listed, in the same order, still one Radix tab list. The
 * "no stage went missing" invariant is enforced at compile time by
 * `EveryStageIsGrouped`; this covers what a type cannot — that the headings
 * render, that they are furniture rather than content for assistive tech, and
 * that a group whose optional members are switched off does not lose its head.
 */

// Identity `t` so assertions read against i18n keys rather than English copy.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/components/shared/i18n', () => ({
  useLocale: () => ({ locale: 'en', setLocale: () => {} }),
}));
// ProjectStages reaches for the app-level dialog providers, which live in the
// `(app)` layout. The rail does not use either, so they are stubbed rather than
// mounted — the alternative is standing up the whole provider stack to render a
// list of tabs.
jest.mock('@/components/billing/upgrade-dialog', () => ({
  useUpgrade: () => async () => false,
}));
jest.mock('@/components/shared/confirm-dialog', () => ({
  useConfirm: () => async () => false,
}));

const noop = () => {};

type StagesProps = ComponentProps<typeof ProjectStages>;

function renderStages(overrides: Partial<StagesProps> = {}) {
  const props: StagesProps = {
    sessionId: 's1',
    summary: null,
    history: [],
    doc: null,
    design: null,
    dbDesign: null,
    apiDesign: null,
    review: null,
    isPro: true,
    busy: false,
    stream: null,
    error: null,
    versionsReload: 0,
    // The interview tab renders from the `history` prop, so nothing fetches —
    // Radix unmounts every inactive panel, which is what keeps this cheap.
    tab: 'interview',
    onTabChange: noop,
    dirty: false,
    onDirty: noop,
    onGenerateRequirements: noop,
    onGenerateSystem: noop,
    onGenerateDatabase: noop,
    onGenerateApi: noop,
    onGenerateReview: noop,
    onFixApplied: noop,
    onSavedDoc: noop,
    onSavedDesign: noop,
    onSavedDbDesign: noop,
    onSavedApiDesign: noop,
    onRefined: noop,
    onRestored: noop,
    ...overrides,
  };
  return render(<ProjectStages {...props} />);
}

/** Stage keys in rail order — `tab.*` because `t` is the identity function. */
function railOrder(): string[] {
  return within(screen.getByRole('tablist'))
    .getAllByRole('tab')
    .map((el) => el.textContent ?? '')
    .map((text) => text.replace(/\s+/g, ' ').trim());
}

describe('stage rail grouping', () => {
  it('lists every stage, in the deal-first order R12 established', () => {
    renderStages();
    // Grouping is a layout change and nothing more: this is byte-for-byte the
    // order the flat list had, so R12's "ordered by the deal, not the build"
    // survives the restructure.
    expect(railOrder()).toEqual([
      'tab.interview',
      'tab.business',
      'tab.vision',
      'tab.requirements',
      'tab.cost',
      'tab.roadmap',
      'tab.system',
      'tab.database',
      'tab.api',
      'tab.apidocs',
      'tab.diagrams',
      'tab.canvas',
      'tab.review',
      'tab.threat',
      'tab.qa',
      'tab.export',
      'tab.refine',
      'tab.history',
    ]);
  });

  it('renders a heading for each labelled phase', () => {
    renderStages();
    for (const group of ['deal', 'build', 'assurance', 'handoff']) {
      expect(screen.getByText(`nav.group.${group}`)).toBeInTheDocument();
    }
  });

  it('gives the source stage no heading of its own', () => {
    // A label over a single item explains one thing and reads as the start of
    // the list rather than a section of it — Interview precedes the phases.
    renderStages();
    expect(screen.queryByText('nav.group.source')).not.toBeInTheDocument();
  });

  it('keeps the headings out of the tab list’s accessible tree', () => {
    renderStages();
    // ARIA requires a tablist's children to be tabs. The headings are a visual
    // scanning aid, so they are hidden rather than announced between two tabs —
    // and the tab list itself stays complete.
    const heading = screen.getByText('nav.group.build');
    expect(heading).toHaveAttribute('aria-hidden', 'true');
    expect(within(screen.getByRole('tablist')).getAllByRole('tab')).toHaveLength(18);
  });

  it('keeps the Assurance heading when the optional stages are switched off', () => {
    // R12 hides the threat model + QA plan for a project that opted out. Review
    // remains, so the group shrinks rather than emptying — and a heading over a
    // surviving item must not disappear with its neighbours.
    renderStages({ extendedArtifacts: false });
    const order = railOrder();
    expect(order).not.toContain('tab.threat');
    expect(order).not.toContain('tab.qa');
    expect(order).toContain('tab.review');
    expect(screen.getByText('nav.group.assurance')).toBeInTheDocument();
  });
});
