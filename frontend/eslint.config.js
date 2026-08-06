import js from '@eslint/js'
import tseslint from 'typescript-eslint'

const tsRules = {
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-unused-expressions': 'off',
  'no-undef': 'off',
  '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  '@typescript-eslint/no-explicit-any': 'off',
  '@typescript-eslint/no-empty-object-type': 'off'
}

const jsRules = {
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-unused-expressions': 'off',
  'no-undef': 'off',
  'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
}

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'android/**', 'android-overlay/**', 'coverage/**', '.ts-cache/**', 'functions/.ts-cache/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['**/*.{test,spec}.{ts,tsx}'],
    extends: tseslint.configs.recommended,
    languageOptions: {
      parserOptions: { projectService: true }
    },
    rules: tsRules
  },
  {
    files: ['**/*.{test,spec}.{ts,tsx}', 'functions/**/*.ts', '*.{ts,mjs,js}', '**/*.config.ts'],
    extends: tseslint.configs.recommended,
    languageOptions: {
      parser: tseslint.parser
    },
    rules: tsRules
  },
  {
    files: ['functions/**/*.{js,mjs}', 'public/**/*.js', '*.{js,mjs}'],
    rules: jsRules
  }
)
