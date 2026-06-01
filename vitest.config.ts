import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // Порог стартует на сервисах; включается, когда появятся services (Фаза 2+).
      thresholds: { lines: 0, functions: 0, branches: 0, statements: 0 },
    },
    projects: [
      {
        // Node-проект: shared + api (юнит и интеграционные тесты).
        extends: true,
        test: {
          name: 'node',
          globals: false,
          environment: 'node',
          include: ['packages/**/*.test.ts', 'apps/api/**/*.test.ts', 'apps/api/**/*.itest.ts'],
          // *.itest.ts шарят одну Postgres-БД и чистят таблицы в beforeEach. При
          // параллельном прогоне файлов truncate одного файла затирает данные другого
          // (гонки duplicate key / пустые списки). Сериализуем файлы — изоляция на
          // уровне БД, а не воркеров.
          fileParallelism: false,
        },
      },
      // Web-проект: React-компоненты в jsdom (конфиг — в apps/web/vite.config.ts).
      './apps/web/vite.config.ts',
    ],
  },
});
