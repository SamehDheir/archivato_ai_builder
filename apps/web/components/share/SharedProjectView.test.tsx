import { render, screen } from '@testing-library/react';
import type { SharedProject } from '@archivato/shared';
import { SharedProjectView } from './SharedProjectView';
import {
  EXAMPLE_API_DESIGN,
  EXAMPLE_DATABASE_DESIGN,
  EXAMPLE_REQUIREMENTS,
  EXAMPLE_REVIEW,
  EXAMPLE_SYSTEM_DESIGN,
} from '@/lib/example-project';

// Identity `t` so assertions can match on i18n keys + rendered fixture data.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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
  requirements: EXAMPLE_REQUIREMENTS,
  systemDesign: EXAMPLE_SYSTEM_DESIGN,
  databaseDesign: EXAMPLE_DATABASE_DESIGN,
  apiDesign: EXAMPLE_API_DESIGN,
  review: EXAMPLE_REVIEW,
};

describe('SharedProjectView', () => {
  it('renders the design read-only, with the growth CTA', async () => {
    render(<SharedProjectView project={project} />);

    // Waits out the i18n-namespace gate (skeleton → content).
    expect(
      await screen.findByRole('heading', { name: 'HomeHelper', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText(project.idea.idea)).toBeInTheDocument();
    expect(screen.getByText('readonly')).toBeInTheDocument();

    // The proof stats are computed from the design, not hard-coded. Read each
    // one through its own label — the fixture has equal service and table counts,
    // so matching on the number alone would pass even if they were swapped.
    const stat = (key: string) =>
      screen.getByText(key).parentElement?.querySelector('dd')?.textContent;
    expect(stat('stat.services')).toBe(
      String(EXAMPLE_SYSTEM_DESIGN.services.length),
    );
    expect(stat('stat.tables')).toBe(
      String(EXAMPLE_DATABASE_DESIGN.entities.length),
    );
    expect(stat('stat.endpoints')).toBe(
      String(
        EXAMPLE_API_DESIGN.modules.reduce((n, m) => n + m.endpoints.length, 0),
      ),
    );

    // The CTA is the whole point of the page: it must reach the signup.
    expect(screen.getByRole('link', { name: 'cta.action' })).toHaveAttribute(
      'href',
      '/register',
    );
  });

  it('hides the review tab when the owner never ran a review', async () => {
    render(<SharedProjectView project={{ ...project, review: null }} />);

    await screen.findByRole('heading', { name: 'HomeHelper', level: 1 });
    expect(screen.getByText('tab.system')).toBeInTheDocument();
    expect(screen.queryByText('tab.review')).not.toBeInTheDocument();
  });

  // Sharing is free, but the API design and the review are Pro stages — so a link
  // minted by a free owner carries neither, and the page must still stand up.
  it('renders a free-tier design with no API design', async () => {
    render(
      <SharedProjectView
        project={{ ...project, apiDesign: null, review: null }}
      />,
    );

    await screen.findByRole('heading', { name: 'HomeHelper', level: 1 });
    expect(screen.getByText('tab.database')).toBeInTheDocument();
    expect(screen.queryByText('tab.api')).not.toBeInTheDocument();
    // A "0 endpoints" tile would read as a claim about the design, not the plan.
    expect(screen.queryByText('stat.endpoints')).not.toBeInTheDocument();
    expect(screen.getByText('stat.tables')).toBeInTheDocument();
  });
});
