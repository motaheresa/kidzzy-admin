// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // private_evidence is local reference material (CLAUDE.md), never linted
    ignores: ['eslint.config.mjs', 'dist/**', 'src/generated/**', '**/private_evidence/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
  {
    // App code logs through Nest's Logger, never console: a stray console.log of a request body
    // or a password would end up in the PM2 logs. The seed and the tests may still print.
    files: ['src/**/*.ts'],
    rules: { 'no-console': 'error' },
  },
  {
    // Repository layer (ADR-0011): only repositories and the prisma module touch Prisma.
    // Services, controllers, mappers and guards go through a repository's intent-named methods.
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.repository.ts', 'src/modules/prisma/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/prisma/prisma.service', '**/generated/prisma/**', '@prisma/*'],
              message:
                'Only repositories (*.repository.ts) and the prisma module use Prisma; call a repository method instead (ADR-0011).',
            },
          ],
        },
      ],
    },
  },
);
