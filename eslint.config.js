import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

// Flat config for ESLint v9. Mirrors the Vite React template with one
// StockChat-specific tweak: we warn (not error) on unused vars and allow
// leading-underscore escape hatches, so the lint pass can surface real
// react-hooks issues without drowning them in noise from in-progress work.
export default [
  { ignores: ['dist', 'dist-*', 'node_modules', 'supabase/.temp', 'mockup-*.html'] },
  // Service workers run in a different global scope — give them their
  // own globals so references like `clients` resolve without no-undef.
  {
    files: ['public/sw.js', '**/*.sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.serviceworker },
      sourceType: 'script',
    },
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...js.configs.recommended.rules,
      // Critical: without jsx-uses-vars, every component imported and only
      // referenced inside JSX is flagged as unused. This rule is the reason
      // eslint-plugin-react exists for hook-only codebases.
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      // We use the new JSX transform, so React doesn't need to be in scope.
      'react/react-in-jsx-scope': 'off',
      // We don't type-check via PropTypes — this project leans on runtime shape.
      'react/prop-types': 'off',
      // Stylistic — we render plain apostrophes in JSX text and React handles it fine.
      'react/no-unescaped-entities': 'off',
      // DevTools nicety; not worth failing CI over.
      'react/display-name': 'off',
      // Underscore-prefixed names are the escape hatch for intentionally
      // unused args/vars. Everything else warns.
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Lets files that export a constant alongside components (e.g. a
      // tab key) still play nice with Vite's Fast Refresh.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // We have plenty of intentional empty catches on localStorage where
      // null/false is the documented contract. Only flag empty blocks
      // outside of catches.
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
];
