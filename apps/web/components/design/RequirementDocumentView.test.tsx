import { render, screen } from '@testing-library/react';
import type { RequirementDocument } from '@archivato/shared';
import { RequirementDocumentView } from './RequirementDocumentView';

// Identity `t` so assertions match on fixture data + i18n keys.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const DOC: RequirementDocument = {
  sessionId: 's1',
  generatedAt: '2026-07-15T00:00:00.000Z',
  executiveSummary: 'EXEC_SUMMARY for a non-technical client.',
  functional: [
    {
      id: 'FR-1',
      title: 'FUNCTIONAL_TITLE',
      description: 'Customers can do the thing.',
      priority: 'must',
    },
  ],
  nonFunctional: [{ id: 'NFR-1', category: 'security', description: 'NFR_TECHNICAL_TEXT' }],
  roles: [{ name: 'Customer', description: 'A buyer.', permissions: ['booking:create'] }],
  businessRules: [{ id: 'BR-1', description: 'BUSINESS_RULE_TEXT' }],
  constraints: ['CONSTRAINT_TEXT'],
  assumptions: ['legacy assumption'],
  outOfScope: [{ item: 'OUT_OF_SCOPE_ITEM', reason: 'deferred' }],
  assumptionsAndOpenQuestions: [
    { assumption: 'ASSUMPTION_TEXT', impactIfWrong: 'IMPACT_TEXT' },
  ],
  openQuestions: [],
};

describe('RequirementDocumentView', () => {
  it('client audience shows the business sections and hides the technical ones', () => {
    render(<RequirementDocumentView doc={DOC} audience="client" />);

    expect(screen.getByText('EXEC_SUMMARY for a non-technical client.')).toBeInTheDocument();
    expect(screen.getByText('FUNCTIONAL_TITLE')).toBeInTheDocument();
    expect(screen.getByText('OUT_OF_SCOPE_ITEM')).toBeInTheDocument();
    expect(screen.getByText('ASSUMPTION_TEXT')).toBeInTheDocument();

    // The technical sections must NOT be in the client-facing block.
    expect(screen.queryByText('NFR_TECHNICAL_TEXT')).not.toBeInTheDocument();
    expect(screen.queryByText('BUSINESS_RULE_TEXT')).not.toBeInTheDocument();
    expect(screen.queryByText('CONSTRAINT_TEXT')).not.toBeInTheDocument();
    // …and no document header (the surrounding share section provides the title).
    expect(screen.queryByText('requirements.title')).not.toBeInTheDocument();
  });

  it('technical audience shows only the developer-facing sections', () => {
    render(<RequirementDocumentView doc={DOC} audience="technical" />);

    expect(screen.getByText('NFR_TECHNICAL_TEXT')).toBeInTheDocument();
    expect(screen.getByText('BUSINESS_RULE_TEXT')).toBeInTheDocument();
    expect(screen.getByText('CONSTRAINT_TEXT')).toBeInTheDocument();

    // The client-facing sections live in the "What's included" block, not here.
    expect(screen.queryByText('FUNCTIONAL_TITLE')).not.toBeInTheDocument();
    expect(
      screen.queryByText('EXEC_SUMMARY for a non-technical client.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('OUT_OF_SCOPE_ITEM')).not.toBeInTheDocument();
  });

  it('full audience shows every section plus the document header', () => {
    render(<RequirementDocumentView doc={DOC} audience="full" />);

    expect(screen.getByText('requirements.title')).toBeInTheDocument();
    expect(screen.getByText('FUNCTIONAL_TITLE')).toBeInTheDocument();
    expect(screen.getByText('NFR_TECHNICAL_TEXT')).toBeInTheDocument();
    expect(screen.getByText('OUT_OF_SCOPE_ITEM')).toBeInTheDocument();
  });

  it('falls back to flat assumptions + open questions for older documents', () => {
    const legacy: RequirementDocument = {
      ...DOC,
      executiveSummary: undefined,
      outOfScope: undefined,
      assumptionsAndOpenQuestions: undefined,
      assumptions: ['LEGACY_ASSUMPTION'],
      openQuestions: [
        { slotKey: 'integrations', questionForClient: 'LEGACY_OPEN_QUESTION' },
      ],
    };
    render(<RequirementDocumentView doc={legacy} audience="client" />);

    expect(screen.getByText('LEGACY_ASSUMPTION')).toBeInTheDocument();
    expect(screen.getByText('LEGACY_OPEN_QUESTION')).toBeInTheDocument();
  });
});
