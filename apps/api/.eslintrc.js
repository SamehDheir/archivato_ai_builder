/**
 * ESLint for the API workspace.
 *
 * Deliberately the *non* type-checked preset: type errors are already caught by
 * `nest build` (tsc) in the same CI job, and the type-aware rules would make the
 * lint step several times slower to re-report them.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { sourceType: 'module', ecmaVersion: 2022 },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: { node: true, jest: true },
  ignorePatterns: ['.eslintrc.js', 'dist', 'node_modules'],
  rules: {
    // Nest's DI and the repository seams are interface-driven; an empty
    // constructor body with parameter properties is idiomatic, not a smell.
    '@typescript-eslint/no-empty-function': ['error', { allow: ['constructors'] }],
    // `_`-prefixed args are the project's "intentionally unused" convention.
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    // The Arabic-script detector (`interview/language.ts`) spells its Unicode
    // blocks as literal characters, and the presentation-forms range ends at
    // U+FEFF — which this rule counts as irregular whitespace. The range is
    // correct; only the *source* outside regexes needs policing.
    'no-irregular-whitespace': ['error', { skipRegExps: true }],
  },
};
