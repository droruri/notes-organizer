import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'supabase/.temp/**',
      '.idea/**',
      '.claude/**',
      '.ralph/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { regex: '^\\.{1,2}/.*\\.js$', message: 'Relative imports have no .js suffix' },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { react, 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    settings: { react: { version: '19.3' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react/no-multi-comp': ['error', { ignoreStateless: false }],
      'react/no-unstable-nested-components': 'error',
      'react-refresh/only-export-components': 'error',
    },
  },
  prettier,
);
