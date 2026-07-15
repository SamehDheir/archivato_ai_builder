import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateSystemDesignDto } from './update-system-design.dto';

const base = {
  architecture: 'modular_monolith',
  architectureRationale: 'Simplest that fits.',
  techStack: [{ layer: 'backend', technology: 'NestJS', rationale: 'DI.' }],
  services: [{ name: 'Auth', responsibility: 'Auth.', dependencies: [] }],
};

function errorsFor(payload: unknown): number {
  const dto = plainToInstance(UpdateSystemDesignDto, payload);
  return validateSync(dto as object, { whitelist: true }).length;
}

describe('UpdateSystemDesignDto (R8 validation)', () => {
  it('accepts a well-formed build-vs-buy item', () => {
    expect(
      errorsFor({
        ...base,
        buildVsBuy: [
          {
            capability: 'payments',
            recommendation: 'buy',
            suggestedService: 'Stripe',
            rationale: 'PCI.',
            impact: 'fees',
          },
        ],
      }),
    ).toBe(0);
  });

  it('rejects an unknown build-vs-buy capability', () => {
    expect(
      errorsFor({
        ...base,
        buildVsBuy: [
          { capability: 'blockchain', recommendation: 'buy', rationale: 'x', impact: 'y' },
        ],
      }),
    ).toBeGreaterThan(0);
  });

  it('rejects an invalid recommendation', () => {
    expect(
      errorsFor({
        ...base,
        buildVsBuy: [
          { capability: 'auth', recommendation: 'rent', rationale: 'x', impact: 'y' },
        ],
      }),
    ).toBeGreaterThan(0);
  });

  it('rejects an invalid module complexity', () => {
    expect(
      errorsFor({
        ...base,
        services: [
          { name: 'Auth', responsibility: 'Auth.', dependencies: [], complexity: 'HUGE' },
        ],
      }),
    ).toBeGreaterThan(0);
  });

  it('accepts a valid module complexity', () => {
    expect(
      errorsFor({
        ...base,
        services: [
          { name: 'Auth', responsibility: 'Auth.', dependencies: [], complexity: 'M' },
        ],
      }),
    ).toBe(0);
  });

  it('accepts the design with no R8 fields (fully back-compat)', () => {
    expect(errorsFor(base)).toBe(0);
  });
});
