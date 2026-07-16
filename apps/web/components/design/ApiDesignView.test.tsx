import { render, screen } from '@testing-library/react';
import type { ApiDesign, ApiModule } from '@archivato/shared';
import { ApiDesignView } from './ApiDesignView';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

function module(over: Partial<ApiModule> = {}): ApiModule {
  return {
    name: 'Orders',
    basePath: '/api/orders',
    endpoints: [
      {
        method: 'GET',
        path: '/api/orders',
        summary: 'List orders.',
        requestSchema: [],
        responseSchema: [],
        statusCodes: [200],
      },
    ],
    ...over,
  };
}

function design(over: Partial<ApiDesign> = {}): ApiDesign {
  return {
    sessionId: 's1',
    generatedAt: new Date('2026-01-01').toISOString(),
    modules: [module({ coveredEntities: ['orders'] })],
    ...over,
  };
}

describe('ApiDesignView coverage', () => {
  it('counts covered entities across groups, without double counting', () => {
    render(
      <ApiDesignView
        design={design({
          modules: [
            module({ coveredEntities: ['orders', 'customers'] }),
            module({ name: 'Products', coveredEntities: ['products', 'orders'] }),
          ],
        })}
      />,
    );
    expect(
      screen.getByText(/api\.coverage\.summary.*"covered":3.*"excluded":0/),
    ).toBeInTheDocument();
  });

  it('lists each excluded entity with the reason it was left out', () => {
    render(
      <ApiDesignView
        design={design({
          excludedEntities: [
            {
              entity: 'order_products',
              reason: 'Join table managed through the Orders resource.',
            },
          ],
        })}
      />,
    );
    expect(screen.getByText('order_products')).toBeInTheDocument();
    expect(
      screen.getByText('Join table managed through the Orders resource.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/api\.coverage\.summary.*"excluded":1/),
    ).toBeInTheDocument();
  });

  it('flags a group nobody designed so it gets a second look', () => {
    render(
      <ApiDesignView
        design={design({
          modules: [
            module({ coveredEntities: ['orders'] }),
            module({
              name: 'Invoices',
              coveredEntities: ['invoices'],
              source: 'generated-fallback',
            }),
          ],
        })}
      />,
    );
    expect(screen.getByText('api.coverage.fallback')).toBeInTheDocument();
    expect(
      screen.getByText(/api\.coverage\.needsReview.*"n":1/),
    ).toBeInTheDocument();
  });

  it('says nothing about coverage on a design generated before it existed', () => {
    // No claims to render. "0 entities covered" would read as a broken API.
    render(<ApiDesignView design={design({ modules: [module()] })} />);
    expect(screen.queryByText(/api\.coverage\.summary/)).not.toBeInTheDocument();
  });
});
