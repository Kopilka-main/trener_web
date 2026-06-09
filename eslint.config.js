import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/*.tsbuildinfo',
      // Offline-скрипты обслуживания (запуск через node), вне tsconfig-проектов.
      'apps/*/scripts/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: { allowDefaultProject: ['*.config.ts', 'apps/*/*.config.ts'] },
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
  // Web (браузерный воркспейс): browser-глобалы для .ts/.tsx.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  // Тесты: console и any допустимы при необходимости отладки.
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: { 'no-console': 'off' },
  },
  // JS-конфиги (например, сам eslint.config.js) не покрыты ts-проектом — без type-checked правил.
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  // TS-конфиги вне tsconfig include (drizzle.config.ts) — без type-checked правил.
  {
    files: ['**/*.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
