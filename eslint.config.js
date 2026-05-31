import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/build/**', '**/coverage/**', '**/*.tsbuildinfo'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: { allowDefaultProject: ['*.config.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  // Граница слоёв: routes не импортирует repo напрямую.
  {
    files: ['apps/api/src/modules/**/*.routes.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['*.repo', '*.repo.js', '**/db/*'] }],
    },
  },
  // Граница слоёв: repo не импортирует HTTP-слой.
  {
    files: ['apps/api/src/modules/**/*.repo.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['fastify', '*.routes', '*.routes.js'] }],
    },
  },
  // Тесты: console и any допустимы при необходимости отладки.
  {
    files: ['**/*.test.ts'],
    rules: { 'no-console': 'off' },
  },
  // JS-конфиги (например, сам eslint.config.js) не покрыты ts-проектом — без type-checked правил.
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
