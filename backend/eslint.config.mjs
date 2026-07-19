import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import importX from 'eslint-plugin-import-x'

export default tseslint.config(
  {
    ignores: [
      'node_modules/',
      'dist/',
      'data/', // Docker mongo volume (root-owned)
      'init-mongo.js',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.node, // Node.js environment (was env: { node: true })
    },
  },
  {
    // Plain JS config files (jest.config.js etc.) are CommonJS
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
    },
  },
  {
    plugins: {
      'import-x': importX,
    },
    settings: {
      'import-x/resolver': {
        typescript: {
          alwaysTryTypes: true, // Always try to resolve types under `@types` directory even if not explicitly imported
        },
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx'], // Include TypeScript extensions
        },
      },
    },
    rules: {
      // General ESLint rules
      'no-console': 'off', // Don't warn on console.logs
      'no-unused-vars': 'off', // Disable as it conflicts with @typescript-eslint/no-unused-vars
      'no-empty-function': 'off', // Disable as it conflicts with @typescript-eslint/no-empty-function

      // TypeScript-specific rules
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }], // Warn on unused variables except those starting with "_"
      '@typescript-eslint/no-empty-function': ['warn'], // Warn on empty functions
      '@typescript-eslint/explicit-module-boundary-types': 'off', // Disable explicit return types for simplicity
      '@typescript-eslint/no-explicit-any': 'warn', // Discourage use of `any`, but allow it with a warning

      // Import rules
      'import-x/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
          'newlines-between': 'always',
        },
      ],
    },
  },
)
