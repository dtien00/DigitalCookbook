/* eslint-env node */
// The repo shipped a `lint` script and the eslint-plugin-react* devDeps but no
// actual config, so `npm run lint` errored ("couldn't find a configuration
// file"). This is the standard Vite + React (JS, no TypeScript) flat-of-extends
// config. prop-types is off because this project doesn't use runtime PropTypes.
module.exports = {
  root: true,
  env: { browser: true, es2020: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'coverage', '.eslintrc.cjs'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    'react/prop-types': 'off',
    // Cosmetic only — the UI copy intentionally contains apostrophes/quotes.
    'react/no-unescaped-entities': 'off',
    // Kept as a (non-blocking) warning, not an error: this codebase
    // deliberately controls effect dependencies (documented stale-closure
    // discipline in refs/TECHNICAL_CONCEPTS.md §5) and already carries inline
    // disable directives at the intentional sites. CI gates on errors, so these
    // surface as advisory debt without blocking the build.
    'react-hooks/exhaustive-deps': 'warn',
    // Honor the conventional underscore-prefix for deliberately-unused bindings.
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
}
