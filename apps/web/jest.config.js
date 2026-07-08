const nextJest = require('next/jest');

// Loads next.config + .env and wires SWC transforms / CSS + asset mocks, so
// component tests run through the same pipeline as the app.
const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // Mirror the tsconfig path aliases (next/jest does not read tsconfig paths).
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@archivato/shared$': '<rootDir>/../../packages/shared/src/index.ts',
  },
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],
};

module.exports = createJestConfig(config);
