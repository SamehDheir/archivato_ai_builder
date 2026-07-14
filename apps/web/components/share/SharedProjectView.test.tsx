import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SharedProject } from '@archivato/shared';
import { SharedProjectView } from './SharedProjectView';
import {
  EXAMPLE_API_DESIGN,
  EXAMPLE_COST_ESTIMATE,
  EXAMPLE_DATABASE_DESIGN,
  EXAMPLE_REQUIREMENTS,
  EXAMPLE_REVIEW,
  EXAMPLE_ROADMAP,
  EXAMPLE_SYSTEM_DESIGN,
  EXAMPLE_VISION,
} from '@/lib/example-project';

// Identity `t` so assertions can match on i18n keys + rendered fixture data.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// `useFormat` (used by the header + the Vision/Cost views) reads the active
// locale from LocaleProvider, which we can't mount here because react-i18next is
// mocked. Stubbing the locale keeps the real `Intl` formatting path under test.
jest.mock('@/components/shared/i18n', () => ({
  useLocale: () => ({ locale: 'en', setLocale: () => {} }),
}));

// The ER diagram (inside the Database appendix) reads the theme to pick its
// Mermaid palette. The real page gets ThemeProvider from the root layout; here we
// only need the value, not the provider.
jest.mock('@/components/shared/theme', () => ({
  useTheme: () => ({ theme: 'light', toggle: () => {}, setTheme: () => {} }),
}));

// The real loader dynamic-imports the `stages`/`share` bundles into the i18next
// singleton — pointless here (react-i18next is mocked) and it would pull i18next
// in. Resolving immediately still exercises the component's "hold until ready" gate.
jest.mock('@/lib/i18n/client', () => ({
  loadShareNamespaces: () => Promise.resolve(),
}));

const project: SharedProject = {
  token: 'tok_123',
  title: 'HomeHelper',
  sharedAt: '2026-07-12T00:00:00.000Z',
  idea: { idea: 'Book vetted home-services professionals in minutes' },
  vision: EXAMPLE_VISION,
  requirements: EXAMPLE_REQUIREMENTS,
  costEstimate: EXAMPLE_COST_ESTIMATE,
  roadmap: EXAMPLE_ROADMAP,
  systemDesign: EXAMPLE_SYSTEM_DESIGN,
  databaseDesign: EXAMPLE_DATABASE_DESIGN,
  apiDesign: EXAMPLE_API_DESIGN,
  review: EXAMPLE_REVIEW,
};

describe('SharedProjectView', () => {
  it("leads with the client's project name, not our branding", async () => {
    render(<SharedProjectView project={project} />);

    // Waits out the i18n-namespace gate (skeleton → content).
    expect(
      await screen.findByRole('heading', { name: 'HomeHelper', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText(project.idea.idea)).toBeInTheDocument();

    // The vision statement belongs to the "What we're building" section — the
    // header must not print it a second screen earlier.
    expect(screen.getAllByText(EXAMPLE_VISION.vision)).toHaveLength(1);
  });

  // The reader is the client, deciding whether to sign. The first thing they meet
  // must be what we're building and what it costs — not the schema.
  it('orders the proposal the way a client reads it, appendix last', async () => {
    render(<SharedProjectView project={project} />);
    await screen.findByRole('heading', { name: 'HomeHelper', level: 1 });

    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent);

    expect(headings).toEqual([
      'section.vision.title',
      'section.scope.title',
      'section.cost.title',
      'section.plan.title',
      'appendix.title',
      'cta.title',
    ]);
  });

  // A closed row says "your developer will want this" and stays out of the way;
  // an open ERD says "you should have understood this before signing".
  it('keeps the technical detail collapsed until it is asked for', async () => {
    render(<SharedProjectView project={project} />);
    await screen.findByRole('heading', { name: 'HomeHelper', level: 1 });

    const database = screen.getByRole('button', { name: /appendix.database/ });
    expect(database).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(database);
    expect(database).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows the client the three numbers they actually ask about', async () => {
    render(<SharedProjectView project={project} />);
    await screen.findByRole('heading', { name: 'HomeHelper', level: 1 });

    const tile = (key: string) =>
      screen.getByText(key).parentElement?.querySelector('dd')?.textContent;

    expect(tile('headline.scope')).toBe(
      String(EXAMPLE_REQUIREMENTS.functional.length),
    );
    expect(tile('headline.timeline')).toBe(EXAMPLE_ROADMAP.totalEstimate);
    expect(tile('headline.running')).toMatch(/^\$/);
  });

  // Sharing is free, but the cost estimate, roadmap, API design and review are Pro
  // — a link minted by a free owner carries none of them, and the page must still
  // read as a proposal rather than breaking or showing empty sections.
  it('renders a free-tier link with no cost, roadmap, API or review', async () => {
    render(
      <SharedProjectView
        project={{
          ...project,
          costEstimate: null,
          roadmap: null,
          apiDesign: null,
          review: null,
        }}
      />,
    );

    await screen.findByRole('heading', { name: 'HomeHelper', level: 1 });

    expect(screen.getByText('section.vision.title')).toBeInTheDocument();
    expect(screen.getByText('section.scope.title')).toBeInTheDocument();
    expect(screen.queryByText('section.cost.title')).not.toBeInTheDocument();
    expect(screen.queryByText('section.plan.title')).not.toBeInTheDocument();
    expect(screen.queryByText('appendix.api')).not.toBeInTheDocument();
    expect(screen.queryByText('appendix.review')).not.toBeInTheDocument();
    // …and the appendix the free tier does have is still there.
    expect(screen.getByText('appendix.database')).toBeInTheDocument();
  });

  it('falls back to the idea when the owner never generated a vision', async () => {
    render(<SharedProjectView project={{ ...project, vision: null }} />);

    await screen.findByRole('heading', { name: 'HomeHelper', level: 1 });
    expect(screen.getByText(project.idea.idea)).toBeInTheDocument();
    expect(screen.queryByText('section.vision.title')).not.toBeInTheDocument();
  });

  it('keeps the growth CTA pointed at signup', async () => {
    render(<SharedProjectView project={project} />);
    await screen.findByRole('heading', { name: 'HomeHelper', level: 1 });

    const cta = screen.getByRole('link', { name: 'cta.action' });
    expect(cta).toHaveAttribute('href', '/register');

    // The watermark is what makes a free link market the product.
    const watermark = screen.getByRole('link', {
      name: /Built with Archivato/,
    });
    expect(watermark).toHaveAttribute('href', 'https://archivato.dev');
  });
});
