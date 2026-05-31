# Фаза 1: Фундамент монорепо — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Поднять монорепо с принудительными стандартами кода, работающим Fastify API (health + обработка ошибок + логирование), PostgreSQL через Drizzle с миграциями и тестовой БД, а также CI/CD и Docker Compose — фундамент, на который ставятся auth и доменные модули.

**Architecture:** npm workspaces монорепо: `packages/shared` (типы + Zod), `apps/api` (Fastify, слои routes/service/repo). Стандарты (Prettier/ESLint/tsc/Vitest) принуждаются локально через Husky и в CI через GitHub Actions. БД — PostgreSQL 16 через Drizzle ORM с версионируемыми миграциями. Деплой — Docker Compose (nginx + api + postgres + backup).

**Tech Stack:** Node 20, TypeScript (strict), Fastify, Drizzle ORM, PostgreSQL 16, Zod, pino, Vitest, ESLint (flat config) + typescript-eslint, Prettier, Husky, lint-staged, commitlint, Docker Compose, GitHub Actions.

---

## Дорожная карта фаз (контекст)

Этот план — **Фаза 1 из 7**. Остальные получат собственные детальные планы:

> **Объём — только тренер.** Клиентского приложения/входа/аккаунтов нет (см.
> spec, раздел «Объём проекта»). Учётка только у тренера; клиенты — записи,
> которыми управляет тренер. Связь тренер↔клиент остаётся M:N (`trainer_clients`).

1. **Фундамент** (этот план): монорепо, тулинг, API-скелет, БД, CI/CD, Docker.
2. **Auth (только тренер)**: `trainers` (с учётными данными) + `sessions_auth`, регистрация/вход тренера, argon2, cookie-сессии, `tenant-context` (`trainerId`), guard'ы `requireAuth`/`requireClientAccess`. Без таблицы `users` и клиентских учёток.
3. **Доменное ядро**: `clients` (без `user_id`) + `trainer_clients` (M:N), паттерн модуля, security/isolation-тесты (тренер A ≠ тренер B).
4. **Доменные модули**: exercises, workout-templates, client-workouts, sessions.
5. **Доменные модули 2**: packages, accounting (expenses/incomes), measurements, chat (polling).
6. **Файлы**: `@fastify/multipart`, защищённый роут раздачи, progress-photos, медкарта.
7. **Web SPA (только тренер) + деплой**: React/Vite SPA на новом API без экрана выбора роли и клиентских экранов, прод-деплой на VPS.

---

## Структура файлов (создаётся в этой фазе)

```text
trener-prod/
├── package.json                      # workspaces, общие скрипты
├── tsconfig.base.json                # базовый strict-конфиг TS
├── .prettierrc.json                  # формат
├── .prettierignore
├── eslint.config.js                  # flat config, typescript-eslint, границы слоёв
├── vitest.config.ts                  # корневой конфиг тестов
├── commitlint.config.js              # Conventional Commits
├── .env.example                      # пример окружения
├── AGENTS.md                         # стандарты для AI и людей
├── CLAUDE.md                         # симлинк-дубль на AGENTS.md (копия)
├── .husky/
│   ├── pre-commit                    # lint-staged
│   └── commit-msg                    # commitlint
├── packages/
│   └── shared/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts              # реэкспорт
│           └── health.ts             # пример Zod-схемы + тип (контракт health)
│           └── health.test.ts
├── apps/
│   └── api/
│       ├── package.json
│       ├── tsconfig.json
│       ├── drizzle.config.ts
│       ├── Dockerfile
│       ├── .dockerignore
│       └── src/
│           ├── server.ts             # сборка приложения (buildApp) + listen
│           ├── env.ts                # валидация env через Zod
│           ├── db/
│           │   ├── client.ts         # подключение Drizzle
│           │   └── schema.ts         # стартовая схема (пустая/служебная)
│           ├── plugins/
│           │   └── error-handler.ts  # единый обработчик ошибок
│           ├── errors.ts             # AppError (status, code)
│           └── modules/
│               └── health/
│                   ├── health.routes.ts
│                   └── health.test.ts
├── nginx/
│   └── nginx.conf
├── docker-compose.yml
└── .github/
    └── workflows/
        ├── ci.yml
        └── deploy.yml
```

---

### Task 1: Корневой `package.json` с workspaces

**Files:**

- Create: `package.json`
- Create: `.nvmrc`

- [ ] **Step 1: Создать `.nvmrc`**

```text
20
```

- [ ] **Step 2: Создать корневой `package.json`**

```json
{
  "name": "trener-prod",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc -b --pretty",
    "check": "npm run format:check && npm run lint && npm run typecheck && npm run test",
    "prepare": "husky"
  },
  "devDependencies": {}
}
```

- [ ] **Step 3: Установить и зафиксировать**

Run: `npm install`
Expected: создаётся `package-lock.json`, `node_modules/` (без ошибок).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .nvmrc
git commit -m "chore: монорепо npm workspaces, Node 20"
```

---

### Task 2: Базовый TypeScript-конфиг (strict)

**Files:**

- Create: `tsconfig.base.json`

- [ ] **Step 1: Создать `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "composite": true
  }
}
```

> Примечание: ключ `noFallthroughCasesInSwitch` — английскими буквами (без кириллицы). Скопировать как `"noFallthroughCasesInSwitch": true`.

- [ ] **Step 2: Commit**

```bash
git add tsconfig.base.json
git commit -m "chore: базовый strict tsconfig"
```

---

### Task 3: Prettier

**Files:**

- Create: `.prettierrc.json`
- Create: `.prettierignore`

- [ ] **Step 1: Установить Prettier**

Run: `npm install -D -W prettier`
Expected: prettier добавлен в корневые devDependencies.

- [ ] **Step 2: Создать `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 3: Создать `.prettierignore`**

```text
node_modules
dist
build
coverage
*.tsbuildinfo
package-lock.json
```

- [ ] **Step 4: Проверить, что форматер запускается**

Run: `npm run format:check`
Expected: проходит (или сообщает о файлах для форматирования; команда не падает с ошибкой конфигурации).

- [ ] **Step 5: Commit**

```bash
git add .prettierrc.json .prettierignore package.json package-lock.json
git commit -m "chore: prettier"
```

---

### Task 4: ESLint (flat config) с границами слоёв

**Files:**

- Create: `eslint.config.js`

- [ ] **Step 1: Установить ESLint и плагины**

Run: `npm install -D -W eslint @eslint/js typescript-eslint eslint-config-prettier globals`
Expected: пакеты в корневых devDependencies.

- [ ] **Step 2: Создать `eslint.config.js`**

```js
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
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
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
  prettier,
);
```

- [ ] **Step 3: Проверить запуск линтера**

Run: `npm run lint`
Expected: проходит без ошибок конфигурации (на пустом проекте — 0 проблем).

- [ ] **Step 4: Commit**

```bash
git add eslint.config.js package.json package-lock.json
git commit -m "chore: eslint flat config + границы слоёв"
```

---

### Task 5: Vitest (корневой конфиг + coverage)

**Files:**

- Create: `vitest.config.ts`

- [ ] **Step 1: Установить Vitest**

Run: `npm install -D -W vitest @vitest/coverage-v8`
Expected: пакеты в корневых devDependencies.

- [ ] **Step 2: Создать `vitest.config.ts`**

```ts
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
```

- [ ] **Step 3: Проверить запуск тестов**

Run: `npm run test`
Expected: «No test files found» — это нормально для пустого проекта (команда завершается с кодом 0 при `passWithNoTests`? Vitest по умолчанию падает без тестов; на следующем шаге добавим первый тест в Task 6).

> Примечание: если `vitest run` падает «no test files», не коммитить отдельно — Task 6 добавит первый тест, после чего прогон станет зелёным.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: vitest + coverage"
```

---

### Task 6: Пакет `shared` — контракт health (Zod) с тестом (TDD)

**Files:**

- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Test: `packages/shared/src/health.test.ts`
- Create: `packages/shared/src/health.ts`

- [ ] **Step 1: Создать `packages/shared/package.json`**

```json
{
  "name": "@trener/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "build": "tsc -b" },
  "dependencies": { "zod": "^3.24.1" }
}
```

- [ ] **Step 2: Создать `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Установить, чтобы поднялся workspace-линк**

Run: `npm install`
Expected: `@trener/shared` зарегистрирован в workspaces, `zod` установлен.

- [ ] **Step 4: Написать падающий тест `packages/shared/src/health.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { healthResponseSchema } from './health.js';

describe('healthResponseSchema', () => {
  it('принимает корректный ответ health', () => {
    const parsed = healthResponseSchema.parse({ ok: true, ts: '2026-05-31T00:00:00.000Z' });
    expect(parsed.ok).toBe(true);
  });

  it('отклоняет ответ без ts', () => {
    expect(() => healthResponseSchema.parse({ ok: true })).toThrow();
  });
});
```

- [ ] **Step 5: Запустить тест — убедиться, что падает**

Run: `npx vitest run packages/shared/src/health.test.ts`
Expected: FAIL — `Cannot find module './health.js'` (файл ещё не создан).

- [ ] **Step 6: Создать `packages/shared/src/health.ts`**

```ts
import { z } from 'zod';

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  ts: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
```

- [ ] **Step 7: Создать `packages/shared/src/index.ts`**

```ts
export * from './health.js';
```

- [ ] **Step 8: Запустить тест — убедиться, что проходит**

Run: `npx vitest run packages/shared/src/health.test.ts`
Expected: PASS (2 теста).

- [ ] **Step 9: Commit**

```bash
git add packages/shared package.json package-lock.json
git commit -m "feat(shared): контракт health (Zod-схема + тип)"
```

---

### Task 7: Пакет `api` — env-валидация

**Files:**

- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Test: `apps/api/src/env.test.ts`
- Create: `apps/api/src/env.ts`

- [ ] **Step 1: Создать `apps/api/package.json`**

```json
{
  "name": "@trener/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -b",
    "dev": "tsx watch src/server.ts",
    "start": "node dist/server.js",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  },
  "dependencies": {
    "@trener/shared": "*",
    "fastify": "^5.2.0",
    "pino": "^9.5.0",
    "drizzle-orm": "^0.38.0",
    "postgres": "^3.4.5",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "tsx": "^4.19.2",
    "drizzle-kit": "^0.30.0",
    "@types/node": "^22.10.2"
  }
}
```

- [ ] **Step 2: Создать `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src", "types": ["node"] },
  "include": ["src/**/*"],
  "references": [{ "path": "../../packages/shared" }]
}
```

- [ ] **Step 3: Установить зависимости**

Run: `npm install`
Expected: fastify, drizzle-orm, postgres, pino, tsx, drizzle-kit установлены.

- [ ] **Step 4: Написать падающий тест `apps/api/src/env.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { parseEnv } from './env.js';

describe('parseEnv', () => {
  it('парсит корректное окружение', () => {
    const env = parseEnv({
      NODE_ENV: 'test',
      PORT: '3001',
      DATABASE_URL: 'postgres://u:p@localhost:5432/db',
      COOKIE_SECRET: 'x'.repeat(32),
    });
    expect(env.PORT).toBe(3001);
    expect(env.NODE_ENV).toBe('test');
  });

  it('падает при коротком COOKIE_SECRET', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'test',
        PORT: '3001',
        DATABASE_URL: 'postgres://u:p@localhost:5432/db',
        COOKIE_SECRET: 'short',
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 5: Запустить тест — убедиться, что падает**

Run: `npx vitest run apps/api/src/env.test.ts`
Expected: FAIL — `Cannot find module './env.js'`.

- [ ] **Step 6: Создать `apps/api/src/env.ts`**

```ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),
  COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET должен быть не короче 32 символов'),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  return envSchema.parse(source);
}
```

- [ ] **Step 7: Запустить тест — убедиться, что проходит**

Run: `npx vitest run apps/api/src/env.test.ts`
Expected: PASS (2 теста).

- [ ] **Step 8: Commit**

```bash
git add apps/api package.json package-lock.json
git commit -m "feat(api): валидация окружения через Zod"
```

---

### Task 8: `AppError` + плагин обработки ошибок (TDD)

**Files:**

- Create: `apps/api/src/errors.ts`
- Create: `apps/api/src/plugins/error-handler.ts`
- Test: `apps/api/src/plugins/error-handler.test.ts`

- [ ] **Step 1: Создать `apps/api/src/errors.ts`**

```ts
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (message = 'Не найдено') => new AppError(404, 'NOT_FOUND', message);
export const unauthorized = (message = 'Не авторизован') =>
  new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Доступ запрещён') => new AppError(403, 'FORBIDDEN', message);
```

- [ ] **Step 2: Написать падающий тест `apps/api/src/plugins/error-handler.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { errorHandler } from './error-handler.js';
import { notFound } from '../errors.js';

describe('errorHandler', () => {
  it('маппит AppError в его status и code', async () => {
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    app.get('/boom', () => {
      throw notFound('нет клиента');
    });
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'нет клиента', code: 'NOT_FOUND' });
  });

  it('непредвиденную ошибку отдаёт как 500 без деталей', async () => {
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    app.get('/crash', () => {
      throw new Error('секретные детали');
    });
    const res = await app.inject({ method: 'GET', url: '/crash' });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe('Внутренняя ошибка сервера');
    expect(JSON.stringify(res.json())).not.toContain('секретные детали');
  });
});
```

- [ ] **Step 3: Запустить тест — убедиться, что падает**

Run: `npx vitest run apps/api/src/plugins/error-handler.test.ts`
Expected: FAIL — `Cannot find module './error-handler.js'`.

- [ ] **Step 4: Создать `apps/api/src/plugins/error-handler.ts`**

```ts
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../errors.js';

export function errorHandler(
  error: FastifyError | AppError | ZodError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof AppError) {
    void reply.status(error.status).send({
      error: error.message,
      code: error.code,
      details: error.details,
    });
    return;
  }
  if (error instanceof ZodError) {
    void reply.status(400).send({
      error: 'Ошибка валидации',
      code: 'VALIDATION_ERROR',
      details: error.flatten(),
    });
    return;
  }
  request.log.error({ err: error }, 'Необработанная ошибка');
  void reply.status(500).send({ error: 'Внутренняя ошибка сервера', code: 'INTERNAL' });
}
```

- [ ] **Step 5: Запустить тест — убедиться, что проходит**

Run: `npx vitest run apps/api/src/plugins/error-handler.test.ts`
Expected: PASS (2 теста).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/errors.ts apps/api/src/plugins/error-handler.ts apps/api/src/plugins/error-handler.test.ts
git commit -m "feat(api): AppError + единый error-handler"
```

---

### Task 9: Health-роут + сборка приложения `buildApp` (TDD)

**Files:**

- Create: `apps/api/src/modules/health/health.routes.ts`
- Create: `apps/api/src/app.ts`
- Test: `apps/api/src/modules/health/health.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/modules/health/health.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { healthResponseSchema } from '@trener/shared';
import { buildApp } from '../../app.js';

describe('GET /api/health', () => {
  it('возвращает корректный по контракту ответ', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    // Ответ должен соответствовать общему контракту из @trener/shared.
    expect(() => healthResponseSchema.parse(res.json())).not.toThrow();
    await app.close();
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `npx vitest run apps/api/src/modules/health/health.test.ts`
Expected: FAIL — `Cannot find module '../../app.js'`.

- [ ] **Step 3: Создать `apps/api/src/modules/health/health.routes.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@trener/shared';

export function healthRoutes(app: FastifyInstance): void {
  app.get('/api/health', (): HealthResponse => {
    return { ok: true, ts: new Date().toISOString() };
  });
}
```

- [ ] **Step 4: Создать `apps/api/src/app.ts`**

```ts
import Fastify, { type FastifyInstance } from 'fastify';
import { errorHandler } from './plugins/error-handler.js';
import { healthRoutes } from './modules/health/health.routes.js';

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });
  app.setErrorHandler(errorHandler);
  healthRoutes(app);
  return app;
}
```

- [ ] **Step 5: Запустить тест — убедиться, что проходит**

Run: `npx vitest run apps/api/src/modules/health/health.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/modules/health
git commit -m "feat(api): health-роут + buildApp"
```

---

### Task 10: Точка входа `server.ts`

**Files:**

- Create: `apps/api/src/server.ts`

- [ ] **Step 1: Создать `apps/api/src/server.ts`**

```ts
import { buildApp } from './app.js';
import { parseEnv } from './env.js';

const env = parseEnv(process.env);
const app = buildApp();

app
  .listen({ port: env.PORT, host: '0.0.0.0' })
  .then((address) => {
    app.log.info(`[trener-api] ${address}`);
  })
  .catch((err: unknown) => {
    app.log.error({ err }, 'Не удалось запустить сервер');
    process.exit(1);
  });
```

- [ ] **Step 2: Проверить локальный запуск (с временным env)**

Run (PowerShell):

```powershell
$env:DATABASE_URL='postgres://u:p@localhost:5432/db'; $env:COOKIE_SECRET=('x'*32); npx tsx apps/api/src/server.ts
```

Expected: лог `[trener-api] http://0.0.0.0:3001`. Остановить Ctrl+C.

> БД на этом шаге не используется (подключение появится в Task 11), сервер стартует и отвечает на `/api/health`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "feat(api): точка входа server.ts"
```

---

### Task 11: Drizzle — подключение к Postgres, схема, конфиг миграций

**Files:**

- Create: `apps/api/src/db/schema.ts`
- Create: `apps/api/src/db/client.ts`
- Create: `apps/api/drizzle.config.ts`

- [ ] **Step 1: Создать стартовую схему `apps/api/src/db/schema.ts`**

```ts
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// Служебная таблица версий схемы приложения (доменные таблицы добавит Фаза 2+).
export const schemaMeta = pgTable('schema_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Создать подключение `apps/api/src/db/client.ts`**

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export function createDb(databaseUrl: string) {
  const sql = postgres(databaseUrl, { max: 10 });
  const db = drizzle(sql, { schema });
  return { db, sql };
}

export type Db = ReturnType<typeof createDb>['db'];
```

- [ ] **Step 3: Создать `apps/api/drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
```

- [ ] **Step 4: Сгенерировать первую миграцию**

Run: `npm --prefix apps/api run db:generate`
Expected: создан каталог `apps/api/drizzle/` с SQL-миграцией для `schema_meta`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db apps/api/drizzle.config.ts apps/api/drizzle
git commit -m "feat(api): drizzle подключение, схема schema_meta, первая миграция"
```

---

### Task 12: Интеграционный тест БД (реальный Postgres)

**Files:**

- Create: `apps/api/src/db/client.itest.ts`
- Modify: `vitest.config.ts` (включить `.itest.ts` в `include`)

- [ ] **Step 1: Добавить `.itest.ts` в `include` в `vitest.config.ts`**

Изменить строку `include`:

```ts
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'apps/**/*.itest.ts'],
```

- [ ] **Step 2: Написать падающий интеграционный тест `apps/api/src/db/client.itest.ts`**

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from './client.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('createDb (integration)', () => {
  const { db, sql: pg } = createDb(url!);

  afterAll(async () => {
    await pg.end();
  });

  it('выполняет ping-запрос к Postgres', async () => {
    const result = await db.execute(sql`SELECT 1 AS ping`);
    expect(result[0]).toMatchObject({ ping: 1 });
  });
});
```

- [ ] **Step 3: Поднять тестовую БД и прогнать тест**

Run (PowerShell):

```powershell
docker run --rm -d --name trener-pg-test -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=trener_test -p 5433:5432 postgres:16
$env:DATABASE_URL='postgres://postgres:pg@localhost:5433/trener_test'; npx vitest run apps/api/src/db/client.itest.ts
```

Expected: PASS (1 тест). Без `DATABASE_URL` тест помечается skipped — это допустимо локально.

- [ ] **Step 4: Остановить тестовую БД**

Run: `docker stop trener-pg-test`
Expected: контейнер остановлен.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/client.itest.ts vitest.config.ts
git commit -m "test(api): интеграционный ping Postgres через Drizzle"
```

---

### Task 13: Husky + lint-staged + commitlint

**Files:**

- Create: `.husky/pre-commit`
- Create: `.husky/commit-msg`
- Create: `commitlint.config.js`
- Modify: `package.json` (добавить `lint-staged`)

- [ ] **Step 1: Установить инструменты**

Run: `npm install -D -W husky lint-staged @commitlint/cli @commitlint/config-conventional`
Expected: пакеты в корневых devDependencies.

- [ ] **Step 2: Инициализировать Husky**

Run: `npx husky init`
Expected: создан `.husky/` и hook `pre-commit`; в `package.json` уже есть `"prepare": "husky"`.

- [ ] **Step 3: Записать `.husky/pre-commit`**

```sh
npx lint-staged
```

- [ ] **Step 4: Записать `.husky/commit-msg`**

```sh
npx --no -- commitlint --edit "$1"
```

- [ ] **Step 5: Создать `commitlint.config.js`**

```js
export default { extends: ['@commitlint/config-conventional'] };
```

- [ ] **Step 6: Добавить `lint-staged` в `package.json`**

Добавить в корневой `package.json` верхнеуровневый ключ:

```json
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,yml,yaml}": ["prettier --write"]
  }
```

- [ ] **Step 7: Проверить commitlint**

Run (PowerShell):

```powershell
"feat: тест сообщения" | npx commitlint
```

Expected: проход без ошибок. Затем проверить отказ: `"плохое сообщение" | npx commitlint` → ошибка.

- [ ] **Step 8: Commit**

```bash
git add .husky commitlint.config.js package.json package-lock.json
git commit -m "chore: husky, lint-staged, commitlint"
```

---

### Task 14: `AGENTS.md` (стандарты для AI и людей) + `CLAUDE.md`

**Files:**

- Create: `AGENTS.md`
- Create: `CLAUDE.md`

- [ ] **Step 1: Создать `AGENTS.md`**

```markdown
# Стандарты разработки — Тренер (Prod)

Эти правила обязательны и принуждаются ESLint/CI. Нарушение роняет проверку.

## Архитектура

- Монорепо: `packages/shared` (типы + Zod-контракты), `apps/api` (Fastify), `apps/web` (React).
- Модуль API = папка в `apps/api/src/modules/<domain>/` с файлами:
  - `<domain>.routes.ts` — только HTTP (разбор, вызов сервиса, ответ). Бизнес-логики нет.
  - `<domain>.service.ts` — бизнес-логика, не знает про HTTP, принимает scope.
  - `<domain>.repo.ts` — единственное место с SQL/Drizzle.
  - `<domain>.schema.ts` — Zod-схемы запрос/ответ (реэкспорт из @trener/shared, где это контракт).

## Инварианты (обязательно)

- Каждый запрос в repo принимает scope (`trainerId` либо `clientId`) и фильтрует по нему.
- Валидация входа и сериализация выхода — только Zod-схемами из `@trener/shared`.
- Никаких секретов в коде/репозитории — только через env (см. `.env.example`).
- Приватные файлы раздаются только через защищённый роут, не через статику.
- `routes` не импортирует `repo` напрямую; `repo` не импортирует HTTP-слой (принуждается ESLint).

## Запреты

- `any` (используй `unknown` + сужение).
- Бизнес-логика в `*.routes.ts`.
- `console.log` в коде (разрешены `console.warn`/`console.error`; в API — `app.log`).

## Тестирование

- TDD: сначала падающий тест, затем минимальная реализация.
- Каждый сервис покрыт unit-тестами (бизнес-логика + граничные случаи).
- Каждый доменный модуль с доступом к данным имеет isolation-тест:
  тренер A не видит данные тренера B; клиент видит только своё; без auth → 401.
- Интеграционные тесты repo (`*.itest.ts`) — против реальной Postgres.

## Команды

- `npm run check` — формат + линт + типы + тесты (перед PR обязательно зелёный).
- `npm run dev` — дев-режим (появится в Фазе 7 вместе с web).
- `npm run test` / `npm run test:watch` — тесты.

## Коммиты

- Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:` …), принуждается commitlint.
```

- [ ] **Step 2: Создать `CLAUDE.md` как копию**

`CLAUDE.md` — копия содержимого `AGENTS.md` (на Windows симлинк ненадёжен; держим копию, синхронизируем вручную при изменениях).

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md CLAUDE.md
git commit -m "docs: стандарты разработки AGENTS.md + CLAUDE.md"
```

---

### Task 15: `.env.example`

**Files:**

- Create: `.env.example`

- [ ] **Step 1: Создать `.env.example`**

```text
# Окружение API
NODE_ENV=development
PORT=3001

# PostgreSQL
DATABASE_URL=postgres://postgres:postgres@localhost:5432/trener

# Секрет cookie-сессий (минимум 32 символа)
COOKIE_SECRET=change-me-to-a-long-random-string-min-32

# SMTP (email-провайдер) — заполнить в Фазе 2
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: .env.example"
```

---

### Task 16: Dockerfile для API

**Files:**

- Create: `apps/api/Dockerfile`
- Create: `apps/api/.dockerignore`

- [ ] **Step 1: Создать `apps/api/.dockerignore`**

```text
node_modules
dist
*.tsbuildinfo
```

- [ ] **Step 2: Создать `apps/api/Dockerfile` (multi-stage)**

```dockerfile
# --- build ---
FROM node:20-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @trener/shared && npm run build -w @trener/api

# --- runtime ---
FROM node:20-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/drizzle apps/api/drizzle
EXPOSE 3001
CMD ["node", "apps/api/dist/server.js"]
```

> Примечание: для рантайма `@trener/shared` резолвится через `dist`. В Фазе 7 при сборке учесть, что `package.json` пакета указывает `main` на `src`; для прод-образа добавить поле `"exports"` на `dist` или отдельный prod-конфиг. На этой фазе образ собирается и стартует — проверяется в Task 18.

- [ ] **Step 3: Commit**

```bash
git add apps/api/Dockerfile apps/api/.dockerignore
git commit -m "chore(api): Dockerfile multi-stage"
```

---

### Task 17: docker-compose + nginx

**Files:**

- Create: `docker-compose.yml`
- Create: `nginx/nginx.conf`

- [ ] **Step 1: Создать `nginx/nginx.conf`**

```nginx
events {}
http {
  upstream api { server api:3001; }
  server {
    listen 80;
    location /api/ { proxy_pass http://api; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; }
    # / → статика web появится в Фазе 7
    location / { return 200 'trener-prod ok'; add_header Content-Type text/plain; }
  }
}
```

- [ ] **Step 2: Создать `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
      POSTGRES_DB: trener
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
      timeout: 5s
      retries: 10

  api:
    build: { context: ., dockerfile: apps/api/Dockerfile }
    environment:
      NODE_ENV: production
      PORT: 3001
      DATABASE_URL: postgres://postgres:${POSTGRES_PASSWORD:-postgres}@postgres:5432/trener
      COOKIE_SECRET: ${COOKIE_SECRET:?COOKIE_SECRET обязателен}
    depends_on:
      postgres: { condition: service_healthy }
    volumes:
      - uploads:/data/uploads

  nginx:
    image: nginx:1.27-alpine
    ports: ['8080:80']
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on: [api]

volumes:
  pgdata:
  uploads:
```

> Примечание: контейнер `backup` (ежедневный `pg_dump` + архив uploads) добавляется в Фазе 7 при настройке прод-деплоя — на этой фазе не нужен для проверки фундамента.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml nginx/nginx.conf
git commit -m "chore: docker-compose (postgres + api + nginx) + nginx-конфиг"
```

---

### Task 18: Прогон стека и применение миграций в Docker

**Files:** (только проверка, без новых файлов)

- [ ] **Step 1: Поднять стек**

Run (PowerShell):

```powershell
$env:COOKIE_SECRET=('x'*40); docker compose up -d --build
```

Expected: контейнеры `postgres`, `api`, `nginx` запущены; `postgres` healthy.

- [ ] **Step 2: Применить миграции**

Run (PowerShell):

```powershell
docker compose exec api npm --prefix apps/api run db:migrate
```

Expected: миграция `schema_meta` применена без ошибок.

- [ ] **Step 3: Проверить health через nginx**

Run (PowerShell):

```powershell
Invoke-RestMethod http://localhost:8080/api/health
```

Expected: `ok = True`, присутствует `ts` (ISO-дата).

- [ ] **Step 4: Остановить стек**

Run: `docker compose down`
Expected: контейнеры остановлены (volume `pgdata` сохраняется).

- [ ] **Step 5: Commit (если потребовались правки конфигов на шагах выше)**

```bash
git add -A
git commit -m "chore: проверка стека docker-compose + миграции"
```

> Если правок не было — шаг пропустить (нечего коммитить).

---

### Task 19: CI workflow (GitHub Actions)

**Files:**

- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Создать `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [master]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: pg
          POSTGRES_DB: trener_test
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: postgres://postgres:pg@localhost:5432/trener_test
      COOKIE_SECRET: ci-cookie-secret-which-is-long-enough-xx
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run format:check
      - run: npm run lint
      - run: npm run typecheck
      - run: npm --prefix apps/api run db:migrate
      - run: npm run test
      - run: npm run build
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: lint + typecheck + test (с Postgres) + build"
```

- [ ] **Step 3: (после появления remote) проверить зелёный прогон**

После `git push` и подключения GitHub-remote убедиться, что job `check` зелёный. Включить branch protection на `master` (PR + зелёный CI обязательны) — настройка в GitHub UI.

---

### Task 20: Deploy workflow (каркас)

**Files:**

- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Создать `.github/workflows/deploy.yml`**

```yaml
name: Deploy

on:
  push:
    branches: [master]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    # Деплой только после зелёного CI на том же коммите.
    needs: []
    if: github.ref == 'refs/heads/master'
    steps:
      - uses: actions/checkout@v4
      - name: Build & push image to GHCR
        run: echo "TODO Фаза 7: docker build + push в ghcr.io"
      - name: Deploy to VPS over SSH
        run: echo "TODO Фаза 7: ssh + docker compose pull && up -d && db:migrate + healthcheck"
```

> Примечание: это каркас. Реальные шаги (сборка образа, push в GHCR, SSH-деплой на VPS, применение миграций, healthcheck, секреты в GitHub Secrets) наполняются в Фазе 7, когда есть прод-сервер. Сейчас фиксируем структуру и факт «деплой только из master».

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: каркас deploy workflow (наполнение — Фаза 7)"
```

---

## Definition of Done (Фаза 1)

- `npm run check` зелёный локально (формат, линт, типы, тесты).
- `docker compose up` поднимает postgres + api + nginx; `GET /api/health` через nginx отвечает по контракту.
- Миграция `schema_meta` применяется через Drizzle.
- Husky-хуки и commitlint работают на коммитах.
- CI-workflow зелёный (lint + typecheck + test с Postgres + build).
- `AGENTS.md`/`CLAUDE.md` фиксируют стандарты; границы слоёв принуждаются ESLint.
