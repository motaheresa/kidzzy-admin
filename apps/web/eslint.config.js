import js from '@eslint/js';
import globals from 'globals';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import local from './eslint-rules/import-style.js';

/**
 * Architectural boundaries (ADR-0011). Each folder is an element; an import between elements is
 * refused unless a policy below allows it:
 *
 *   app      -> pages, features (index), ui, lib
 *   pages    -> features (index), ui, lib
 *   feature  -> its own files, another feature's index only, ui, lib
 *   ui       -> ui, lib            (never features, pages or app)
 *   lib      -> lib
 */
// Each pattern names a folder; every file inside it belongs to that element. Files directly in
// src/ (main.tsx, index.css, vite-env.d.ts) are the bootstrap, outside every layer.
const elements = [
  { type: 'test-setup', pattern: 'src/test' },
  { type: 'app', pattern: 'src/app' },
  { type: 'page', pattern: 'src/pages' },
  { type: 'feature', pattern: 'src/features/*', capture: ['feature'] },
  { type: 'ui', pattern: 'src/components/ui' },
  { type: 'lib', pattern: 'src/lib' },
];

const to = (type, extra = {}) => ({ to: { element: { type, ...extra } } });
/** A feature seen from outside: its index.ts only. */
const featureIndex = to('feature', { fileInternalPath: 'index.ts' });

const boundaryPolicies = [
  // npm packages (react, @tanstack/react-query, @kidzzy/shared…) are open to every element.
  { allow: { to: { module: { origin: ['external', 'core'] } } } },
  {
    from: { element: { type: 'app' } },
    allow: [to('app'), to('page'), featureIndex, to('ui'), to('lib')],
  },
  { from: { element: { type: 'page' } }, allow: [to('page'), featureIndex, to('ui'), to('lib')] },
  {
    from: { element: { type: 'feature' } },
    allow: [
      // Anything inside the same feature…
      to('feature', { captured: { feature: '{{ from.element.captured.feature }}' } }),
      // …and only the public index of another one.
      featureIndex,
      to('ui'),
      to('lib'),
    ],
  },
  { from: { element: { type: 'ui' } }, allow: [to('ui'), to('lib')] },
  { from: { element: { type: 'lib' } }, allow: [to('lib')] },
];

const FETCH_MESSAGE =
  'Use the http client from src/lib/http (timeout, refresh, AppError), never fetch directly (ADR-0012).';
const QUERY_MESSAGE =
  'Use useApiQuery / useApiMutation / useQueryClient from src/lib/query, not @tanstack/react-query (ADR-0012).';

export default tseslint.config(
  // private_evidence is local reference material (CLAUDE.md), never linted
  { ignores: ['dist', '**/private_evidence/**'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Anything logged in the browser console is visible to extensions and to anyone at the
      // device, so app code never logs (it once printed the login password).
      'no-console': 'error',
    },
  },
  {
    // The service worker runs in a worker scope (self, caches, clients), not a page.
    files: ['src/sw.ts'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    // Node scripts run by package.json (icons, build checks).
    files: ['scripts/**/*.mjs', 'eslint-rules/**/*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { boundaries, local },
    settings: {
      'boundaries/elements': elements,
      // Resolves "@/..." (tsconfig paths) and extensionless relative imports to their file, so
      // boundaries knows which layer an import reaches.
      'import/resolver': {
        typescript: { project: './tsconfig.app.json' },
        node: { extensions: ['.ts', '.tsx'] },
      },
    },
    rules: {
      'boundaries/dependencies': ['error', { default: 'disallow', policies: boundaryPolicies }],
      // Relative imports inside a unit, "@/..." across units (CLAUDE.md, Imports).
      'local/import-style': 'error',
    },
  },
  {
    // Network layer (ADR-0012): only src/lib/http talks to the network, so every request gets
    // the timeout, the refresh and the AppError mapping.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/http/**'],
    rules: {
      'no-restricted-globals': ['error', { name: 'fetch', message: FETCH_MESSAGE }],
      'no-restricted-properties': [
        'error',
        ...['window', 'globalThis', 'self'].map((object) => ({
          object,
          property: 'fetch',
          message: FETCH_MESSAGE,
        })),
      ],
    },
  },
  {
    // Query layer (ADR-0012): features fetch through useApiQuery / useApiMutation from
    // src/lib/query, which carry the app's error handling and types. Only lib/query and the
    // app layer (QueryClientProvider) import TanStack Query itself.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/query/**', 'src/app/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: '@tanstack/react-query', message: QUERY_MESSAGE }],
          patterns: [{ group: ['@tanstack/react-query/*'], message: QUERY_MESSAGE }],
        },
      ],
    },
  },
);
