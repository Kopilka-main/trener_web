import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // Порог стартует на сервисах; включается, когда появятся services (Фаза 2+).
      thresholds: { lines: 0, functions: 0, branches: 0, statements: 0 },
    },
  },
});
