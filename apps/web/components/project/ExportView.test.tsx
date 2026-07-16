import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportView } from './ExportView';

// Chrome-only assertions: an identity `t` keeps them on behavior, not copy.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// `useLocale` is mocked rather than provided, because react-i18next is already
// mocked out above — importing the real module would initialise i18next against a
// stubbed `initReactI18next`. Same reason as ExampleProjectView/SharedProjectView.
jest.mock('@/components/shared/i18n', () => ({
  useLocale: () => ({ locale: 'en', setLocale: () => {} }),
}));

jest.mock('@/lib/api', () => ({
  exportApi: {
    all: jest.fn(),
    json: jest.fn(),
    markdown: jest.fn(),
    openapi: jest.fn(),
    openapiYaml: jest.fn(),
    structure: jest.fn(),
    sql: jest.fn(),
    postman: jest.fn(),
  },
  shareApi: { create: jest.fn() },
  proposalApi: { generate: jest.fn(), drafts: jest.fn().mockResolvedValue([]) },
}));

// The scaffold panel self-fetches; it isn't what these assertions are about.
jest.mock('./ScaffoldView', () => ({ ScaffoldView: () => null }));

/**
 * R12 reorganised this surface into two primary actions + a dropdown. The point
 * of these tests is the promise that came with it: **no export was removed.**
 */
describe('ExportView', () => {
  it('leads with the two audience-shaped actions', () => {
    render(<ExportView sessionId="s1" />);

    expect(screen.getByText('export.client.title')).toBeInTheDocument();
    expect(screen.getByText('export.team.title')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /export\.client\.cta/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /export\.team\.cta/ }),
    ).toBeInTheDocument();
  });

  // R13 — the link is only half a submission; the message that carries it is the
  // other half, so it sits in the same card rather than behind a format menu.
  it('offers the proposal message beside the client link, and opens the composer', async () => {
    render(<ExportView sessionId="s1" />);

    const write = screen.getByRole('button', { name: /export\.client\.write/ });
    expect(write).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.click(write);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('proposal.title')).toBeInTheDocument();
  });

  it('keeps every individual format reachable under "More formats"', async () => {
    render(<ExportView sessionId="s1" />);

    // Collapsed by default — the formats are one click away, not gone.
    expect(screen.queryByRole('menuitem', { name: /export\.sql/ })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /export\.more/ }));

    // Every format the flat list used to show, still here.
    for (const key of [
      'export.jsonBundle',
      'export.markdown',
      'export.openapiJson',
      'export.openapiYaml',
      'export.structure',
      'export.sql',
      'export.postman',
      'export.pdf',
    ]) {
      expect(
        screen.getByRole('menuitem', { name: new RegExp(key.replace('.', '\\.')) }),
      ).toBeInTheDocument();
    }
  });

  it('closes the dropdown on Escape', async () => {
    render(<ExportView sessionId="s1" />);
    await userEvent.click(screen.getByRole('button', { name: /export\.more/ }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
