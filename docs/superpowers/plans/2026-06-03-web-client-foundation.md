# Клиентское приложение — фундамент. План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Поднять клиентский фронт `apps/web-client` поверх общего API: клиентский auth, резолвер скоупа `clientAccount→{trainerId,clientId}`, онбординг/привязка, скаффолд приложения с заглушками-секциями, раздельный docker-образ.

**Architecture:** Отдельные таблицы `client_accounts`/`client_sessions_auth` (зеркало тренерских). Новый модуль `client-auth` по канону routes/service/repo/schema. Плагин `client-context` декорирует `req.clientAccountId` из cookie `client_sid` (тренерская — `sid`, не пересекаются). Чистый резолвер `resolveClientScope` по `clients.accountId` + активной связи `trainer_clients`. Repo остаются `trainerId`-скоупленными — инвариант CLAUDE.md цел. Фронт — клон `apps/web` (Vite+React+Tailwind v4+TanStack Query) с гейтом доступа и нижней навигацией.

**Tech Stack:** Fastify 5, Drizzle ORM, Postgres 16, Zod (`@trener/shared`), argon2, React 18, Vite 6, Tailwind v4, TanStack Query 5, react-router 6, vitest.

**Спека:** [docs/superpowers/specs/2026-06-03-web-client-foundation-design.md](../specs/2026-06-03-web-client-foundation-design.md)

**Соглашения по командам:** все npm-команды из корня репо. Команды с БД требуют запущенного Postgres и `DATABASE_URL` (локально — docker-postgres на `5432`): PowerShell `$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/trener'`. ESLint+prettier навешаны pre-commit — не обходить.

---

## Карта файлов

**packages/shared**

- Create: `packages/shared/src/client-auth.ts` — Zod-контракты клиентского auth (request/response).
- Modify: `packages/shared/src/index.ts` — реэкспорт `client-auth`.

**packages/theme (новый пакет)**

- Create: `packages/theme/package.json`, `packages/theme/theme.css` — токены Acid Flow (`@theme`-блок).
- Modify: `apps/web/src/index.css` — заменить inline `@theme` на импорт общего файла.

**apps/api**

- Modify: `apps/api/src/db/schema.ts` — таблицы `clientAccounts`, `clientSessionsAuth`.
- Create: `apps/api/drizzle/00XX_*.sql` (+ snapshot/meta) — миграция (генерится drizzle-kit).
- Create: `apps/api/src/modules/client-auth/client-auth.repo.ts` — SQL аккаунтов/сессий + поиск скоупа.
- Create: `apps/api/src/modules/client-auth/client-auth.service.ts` — register/login/logout/me + `resolveClientScope`.
- Create: `apps/api/src/modules/client-auth/client-auth.routes.ts` — `/api/client/auth/*`.
- Create: `apps/api/src/modules/client-auth/client-auth.module.ts` — сборка модуля.
- Create: `apps/api/src/plugins/client-context.ts` — cookie `client_sid` → `req.clientAccountId`, guard `requireClient`.
- Create: тесты `client-auth.service.test.ts`, `client-auth.repo.itest.ts`, `client-auth.isolation.itest.ts`.
- Modify: `apps/api/src/app.ts` — регистрация плагина и модуля.
- Modify: `apps/api/src/modules/clients/clients.repo.ts` + `clients.service.ts` — валидация существования `client_accounts` при привязке.

**apps/web-client (новый workspace)**

- Create: `package.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`.
- Create: `src/main.tsx`, `src/index.css`, `src/App.tsx`, `src/test/setup.ts`.
- Create: `src/api/client.ts`, `src/api/auth.ts`.
- Create: `src/components/BottomNav.tsx`.
- Create: `src/pages/LoginPage.tsx`, `RegisterPage.tsx`, `ConnectPage.tsx`, `StubPage.tsx`.

**Инфраструктура**

- Create: `apps/web-client/Dockerfile`, `nginx/web-client.conf`.
- Modify: `docker-compose.yml` — сервис `web-client`.

---

## Phase 1 — Общие контракты (`@trener/shared`)

### Task 1: Zod-контракты клиентского auth

**Files:**

- Create: `packages/shared/src/client-auth.ts`
- Test: `packages/shared/src/client-auth.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Падающий тест нормализации email**

Create `packages/shared/src/client-auth.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { clientRegisterRequestSchema } from './client-auth.js';

describe('clientRegisterRequestSchema', () => {
  it('нормализует email (trim + lowercase)', () => {
    const parsed = clientRegisterRequestSchema.parse({
      email: '  USER@MAIL.RU ',
      password: 'longenough1',
      firstName: 'Иван',
      lastName: 'Петров',
    });
    expect(parsed.email).toBe('user@mail.ru');
  });

  it('отклоняет короткий пароль', () => {
    expect(() =>
      clientRegisterRequestSchema.parse({
        email: 'u@m.ru',
        password: 'short',
        firstName: 'И',
        lastName: 'П',
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Запустить — упасть**

Run: `npm run test -- client-auth`
Expected: FAIL — `Cannot find module './client-auth.js'`.

- [ ] **Step 3: Реализовать контракты**

Create `packages/shared/src/client-auth.ts`:

```ts
import { z } from 'zod';

const email = z.string().trim().toLowerCase().email();

export const clientRegisterRequestSchema = z.object({
  email,
  password: z.string().min(8, 'Пароль не короче 8 символов').max(200),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
});
export type ClientRegisterRequest = z.infer<typeof clientRegisterRequestSchema>;

export const clientLoginRequestSchema = z.object({
  email,
  password: z.string().min(1).max(200),
});
export type ClientLoginRequest = z.infer<typeof clientLoginRequestSchema>;

export const clientAccountResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  avatarFileId: z.string().nullable(),
});
export type ClientAccountResponse = z.infer<typeof clientAccountResponseSchema>;

/** Привязка клиента к тренеру: null = аккаунт ещё не подключён ни одним тренером. */
export const clientLinkSchema = z
  .object({ trainerId: z.string(), clientId: z.string() })
  .nullable();
export type ClientLink = z.infer<typeof clientLinkSchema>;

export const clientMeResponseSchema = z.object({
  account: clientAccountResponseSchema,
  link: clientLinkSchema,
});
export type ClientMeResponse = z.infer<typeof clientMeResponseSchema>;
```

- [ ] **Step 4: Реэкспорт**

Modify `packages/shared/src/index.ts` — добавить строку после `export * from './auth.js';`:

```ts
export * from './client-auth.js';
```

- [ ] **Step 5: Запустить — пройти + сборка shared**

Run: `npm run test -- client-auth`
Expected: PASS (2 теста).
Run: `npm run build -w @trener/shared`
Expected: успешная сборка (нужна для типов в api/web).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/client-auth.ts packages/shared/src/client-auth.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): контракты клиентского auth"
```

---

## Phase 2 — Схема БД и миграция

### Task 2: Таблицы `client_accounts` и `client_sessions_auth`

**Files:**

- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/00XX_*.sql` (+ meta, генерится автоматически)

- [ ] **Step 1: Добавить таблицы в схему**

Modify `apps/api/src/db/schema.ts` — добавить **после** определения таблицы `clients` (там же объявлена `files` через ленивый FK; `client_accounts.avatarFileId` ссылается на `files`, объявленную ниже — используем тот же приём `AnyPgColumn`, что и в `clients.avatarFileId`):

```ts
// Клиентская учётка (логин клиентского приложения). id = «код подключения»,
// который клиент передаёт тренеру; тренер кладёт его в clients.accountId.
export const clientAccounts = pgTable(
  'client_accounts',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    avatarFileId: text('avatar_file_id').references((): AnyPgColumn => files.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // email нормализован контрактом clientRegisterRequestSchema (lowercase+trim).
  (t) => [uniqueIndex('client_accounts_email_uq').on(t.email)],
);

export const clientSessionsAuth = pgTable('client_sessions_auth', {
  id: text('id').primaryKey(), // случайный токен сессии
  clientAccountId: text('client_account_id')
    .notNull()
    .references(() => clientAccounts.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Сгенерировать миграцию**

Run: `npm run db:generate -w @trener/api`
Expected: создан файл `apps/api/drizzle/00XX_<name>.sql` с `CREATE TABLE "client_accounts"` и `CREATE TABLE "client_sessions_auth"`, обновлён `apps/api/drizzle/meta/_journal.json` и снапшот. (Генерация работает без подключения к БД.)

- [ ] **Step 3: Проверить содержимое миграции**

Read новый `.sql` — убедиться, что есть обе `CREATE TABLE`, `client_accounts_email_uq` и FK на `files`/`client_accounts`. Тип проверки `tsc`:
Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 4: Применить миграцию (нужен Postgres)**

PowerShell:

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/trener'; npm run db:migrate -w @trener/api
```

Expected: миграция применена; в БД появились таблицы `client_accounts`, `client_sessions_auth`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/drizzle
git commit -m "feat(api): таблицы client_accounts и client_sessions_auth"
```

---

## Phase 3 — Бэкенд-модуль `client-auth`

### Task 3: Repo аккаунтов и сессий

**Files:**

- Create: `apps/api/src/modules/client-auth/client-auth.repo.ts`
- Test: `apps/api/src/modules/client-auth/client-auth.repo.itest.ts`

- [ ] **Step 1: Падающий itest**

Create `apps/api/src/modules/client-auth/client-auth.repo.itest.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { makeClientAuthRepo } from './client-auth.repo.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('client-auth.repo (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  const repo = makeClientAuthRepo(db);

  beforeAll(async () => {
    await db.execute(sql`DELETE FROM client_sessions_auth`);
    await db.execute(sql`DELETE FROM client_accounts`);
  });
  afterAll(async () => {
    await pg.end();
  });

  it('создаёт аккаунт и находит по email и id', async () => {
    await repo.createAccount({
      id: 'ca1',
      email: 'c@b.co',
      passwordHash: 'h',
      firstName: 'И',
      lastName: 'К',
    });
    expect((await repo.findAccountByEmail('c@b.co'))?.id).toBe('ca1');
    expect((await repo.findAccountById('ca1'))?.email).toBe('c@b.co');
    expect(await repo.findAccountByEmail('nope@b.co')).toBeNull();
  });

  it('создаёт, находит и удаляет сессию', async () => {
    await repo.createSession({
      id: 'cs1',
      clientAccountId: 'ca1',
      expiresAt: new Date(Date.now() + 3600_000),
    });
    expect((await repo.findSession('cs1'))?.clientAccountId).toBe('ca1');
    await repo.deleteSession('cs1');
    expect(await repo.findSession('cs1')).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить — упасть**

PowerShell:

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/trener'; npm run test -- client-auth.repo
```

Expected: FAIL — `Cannot find module './client-auth.repo.js'`.

- [ ] **Step 3: Реализовать repo**

Create `apps/api/src/modules/client-auth/client-auth.repo.ts`:

```ts
import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { clientAccounts, clientSessionsAuth, clients, trainerClients } from '../../db/schema.js';

export type NewClientAccount = {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
};

export function makeClientAuthRepo(db: Db) {
  return {
    async createAccount(a: NewClientAccount) {
      const [row] = await db.insert(clientAccounts).values(a).returning();
      return row;
    },
    async findAccountByEmail(email: string) {
      const [row] = await db.select().from(clientAccounts).where(eq(clientAccounts.email, email));
      return row ?? null;
    },
    async findAccountById(id: string) {
      const [row] = await db.select().from(clientAccounts).where(eq(clientAccounts.id, id));
      return row ?? null;
    },
    async createSession(s: { id: string; clientAccountId: string; expiresAt: Date }) {
      await db.insert(clientSessionsAuth).values(s);
    },
    async findSession(id: string) {
      const [row] = await db.select().from(clientSessionsAuth).where(eq(clientSessionsAuth.id, id));
      return row ?? null;
    },
    async deleteSession(id: string) {
      await db.delete(clientSessionsAuth).where(eq(clientSessionsAuth.id, id));
    },

    // Резолвер скоупа: по accountId находит запись клиента и активную связь с тренером.
    // v1 — один тренер: берём первую активную связь детерминированно (createdAt, затем trainerId).
    async findScopeByAccountId(
      clientAccountId: string,
    ): Promise<{ trainerId: string; clientId: string } | null> {
      const [row] = await db
        .select({ trainerId: trainerClients.trainerId, clientId: trainerClients.clientId })
        .from(clients)
        .innerJoin(trainerClients, eq(trainerClients.clientId, clients.id))
        .where(and(eq(clients.accountId, clientAccountId), eq(trainerClients.status, 'active')))
        .orderBy(asc(trainerClients.createdAt), asc(trainerClients.trainerId))
        .limit(1);
      return row ?? null;
    },

    // Существует ли клиентский аккаунт с таким id (для валидации привязки тренером).
    async accountExists(id: string): Promise<boolean> {
      const [row] = await db
        .select({ id: clientAccounts.id })
        .from(clientAccounts)
        .where(eq(clientAccounts.id, id));
      return !!row;
    },
  };
}

export type ClientAuthRepo = ReturnType<typeof makeClientAuthRepo>;
```

- [ ] **Step 4: Запустить — пройти**

PowerShell:

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/trener'; npm run test -- client-auth.repo
```

Expected: PASS (2 теста). Без `DATABASE_URL` тесты `skipped` — это норма.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/client-auth/client-auth.repo.ts apps/api/src/modules/client-auth/client-auth.repo.itest.ts
git commit -m "feat(api): repo клиентского auth (аккаунты, сессии, резолвер скоупа)"
```

---

### Task 4: Сервис + резолвер скоупа

**Files:**

- Create: `apps/api/src/modules/client-auth/client-auth.service.ts`
- Test: `apps/api/src/modules/client-auth/client-auth.service.test.ts`

- [ ] **Step 1: Падающий unit-тест**

Create `apps/api/src/modules/client-auth/client-auth.service.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { makeClientAuthService } from './client-auth.service.js';

function fakeRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    createAccount: vi.fn((a: Record<string, unknown>) =>
      Promise.resolve({ ...a, avatarFileId: null, createdAt: new Date() }),
    ),
    findAccountByEmail: vi.fn(() => Promise.resolve(null)),
    findAccountById: vi.fn(() => Promise.resolve(null)),
    createSession: vi.fn(() => Promise.resolve()),
    findSession: vi.fn(() => Promise.resolve(null)),
    deleteSession: vi.fn(() => Promise.resolve()),
    findScopeByAccountId: vi.fn(() => Promise.resolve(null)),
    accountExists: vi.fn(() => Promise.resolve(false)),
    ...overrides,
  } as never;
}

describe('client-auth.service', () => {
  it('register отклоняет дубликат email (409)', async () => {
    const repo = fakeRepo({ findAccountByEmail: vi.fn(() => Promise.resolve({ id: 'ca0' })) });
    const svc = makeClientAuthService(repo, { newId: () => 'id', now: () => new Date(0) });
    await expect(
      svc.register({ email: 'a@b.co', password: 'longenough1', firstName: 'И', lastName: 'К' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('login отклоняет неверный пароль (401)', async () => {
    const repo = fakeRepo({
      findAccountByEmail: vi.fn(() =>
        Promise.resolve({
          id: 'ca1',
          passwordHash: 'h',
          email: 'a@b.co',
          firstName: 'И',
          lastName: 'К',
          avatarFileId: null,
        }),
      ),
    });
    const svc = makeClientAuthService(repo, { newId: () => 'id', now: () => new Date(0) });
    await expect(svc.login({ email: 'a@b.co', password: 'bad' })).rejects.toMatchObject({
      status: 401,
    });
  });

  it('me возвращает link=null для непривязанного аккаунта', async () => {
    const repo = fakeRepo({
      findAccountById: vi.fn(() =>
        Promise.resolve({
          id: 'ca1',
          email: 'a@b.co',
          firstName: 'И',
          lastName: 'К',
          avatarFileId: null,
        }),
      ),
      findScopeByAccountId: vi.fn(() => Promise.resolve(null)),
    });
    const svc = makeClientAuthService(repo, { newId: () => 'id', now: () => new Date(0) });
    const res = await svc.me('ca1');
    expect(res.link).toBeNull();
    expect(res.account.id).toBe('ca1');
  });

  it('me возвращает link со скоупом для привязанного аккаунта', async () => {
    const repo = fakeRepo({
      findAccountById: vi.fn(() =>
        Promise.resolve({
          id: 'ca1',
          email: 'a@b.co',
          firstName: 'И',
          lastName: 'К',
          avatarFileId: null,
        }),
      ),
      findScopeByAccountId: vi.fn(() => Promise.resolve({ trainerId: 't1', clientId: 'cl1' })),
    });
    const svc = makeClientAuthService(repo, { newId: () => 'id', now: () => new Date(0) });
    const res = await svc.me('ca1');
    expect(res.link).toEqual({ trainerId: 't1', clientId: 'cl1' });
  });
});
```

- [ ] **Step 2: Запустить — упасть**

Run: `npm run test -- client-auth.service`
Expected: FAIL — `Cannot find module './client-auth.service.js'`.

- [ ] **Step 3: Реализовать сервис**

Create `apps/api/src/modules/client-auth/client-auth.service.ts`:

```ts
import type { ClientAuthRepo } from './client-auth.repo.js';
import type {
  ClientLoginRequest,
  ClientRegisterRequest,
  ClientAccountResponse,
  ClientLink,
  ClientMeResponse,
} from '@trener/shared';
import { hashPassword, verifyPassword } from '../../auth/password.js';
import { AppError, unauthorized } from '../../errors.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней

export type ClientAuthDeps = { newId: () => string; now: () => Date };
export type ClientSession = { token: string; expiresAt: Date };

function toAccountResponse(a: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarFileId: string | null;
}): ClientAccountResponse {
  return {
    id: a.id,
    email: a.email,
    firstName: a.firstName,
    lastName: a.lastName,
    avatarFileId: a.avatarFileId,
  };
}

export function makeClientAuthService(repo: ClientAuthRepo, deps: ClientAuthDeps) {
  async function startSession(clientAccountId: string): Promise<ClientSession> {
    const token = deps.newId();
    const expiresAt = new Date(deps.now().getTime() + SESSION_TTL_MS);
    await repo.createSession({ id: token, clientAccountId, expiresAt });
    return { token, expiresAt };
  }

  return {
    // Резолвер скоупа — переиспользуется фичевыми клиентскими роутами в секционных спеках.
    resolveScope(clientAccountId: string): Promise<ClientLink> {
      return repo.findScopeByAccountId(clientAccountId);
    },

    async register(
      input: ClientRegisterRequest,
    ): Promise<{ account: ClientAccountResponse; session: ClientSession }> {
      const existing = await repo.findAccountByEmail(input.email);
      if (existing) throw new AppError(409, 'EMAIL_TAKEN', 'Email уже зарегистрирован');
      const passwordHash = await hashPassword(input.password);
      const account = await repo.createAccount({
        id: deps.newId(),
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
      });
      if (!account) throw new AppError(500, 'INTERNAL', 'Не удалось создать аккаунт');
      const session = await startSession(account.id);
      return { account: toAccountResponse(account), session };
    },

    async login(
      input: ClientLoginRequest,
    ): Promise<{ account: ClientAccountResponse; session: ClientSession }> {
      const account = await repo.findAccountByEmail(input.email);
      if (!account) throw unauthorized('Неверный email или пароль');
      const ok = await verifyPassword(account.passwordHash, input.password);
      if (!ok) throw unauthorized('Неверный email или пароль');
      const session = await startSession(account.id);
      return { account: toAccountResponse(account), session };
    },

    async logout(token: string): Promise<void> {
      await repo.deleteSession(token);
    },

    async me(clientAccountId: string): Promise<ClientMeResponse> {
      const account = await repo.findAccountById(clientAccountId);
      if (!account) throw unauthorized('Сессия недействительна');
      const link = await repo.findScopeByAccountId(clientAccountId);
      return { account: toAccountResponse(account), link };
    },
  };
}

export type ClientAuthService = ReturnType<typeof makeClientAuthService>;
```

- [ ] **Step 4: Запустить — пройти**

Run: `npm run test -- client-auth.service`
Expected: PASS (4 теста).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/client-auth/client-auth.service.ts apps/api/src/modules/client-auth/client-auth.service.test.ts
git commit -m "feat(api): сервис клиентского auth + резолвер скоупа"
```

---

### Task 5: Плагин `client-context` (cookie `client_sid`)

**Files:**

- Create: `apps/api/src/plugins/client-context.ts`

- [ ] **Step 1: Реализовать плагин**

Зеркало `tenant-context.ts`, но другая cookie и декорирует `req.clientAccountId`. Create `apps/api/src/plugins/client-context.ts`:

```ts
import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { unauthorized } from '../errors.js';

export const CLIENT_SESSION_COOKIE = 'client_sid';

declare module 'fastify' {
  interface FastifyRequest {
    clientAccountId?: string;
  }
}

type ClientSessionRow = { clientAccountId: string; expiresAt: Date };

export type ClientContextOpts = {
  findSession: (id: string) => Promise<ClientSessionRow | null>;
  now?: () => Date;
};

const plugin: FastifyPluginAsync<ClientContextOpts> = (app, opts) => {
  const now = opts.now ?? (() => new Date());
  app.addHook('onRequest', async (req) => {
    const token = req.cookies[CLIENT_SESSION_COOKIE];
    if (!token) return;
    const session = await opts.findSession(token);
    if (!session) return;
    if (session.expiresAt.getTime() <= now().getTime()) return;
    req.clientAccountId = session.clientAccountId;
  });
  return Promise.resolve();
};

export const clientContext = fp(plugin, {
  name: 'client-context',
  dependencies: ['@fastify/cookie'],
});

export function requireClient(
  req: FastifyRequest,
  _reply: FastifyReply,
  done: (err?: Error) => void,
): void {
  if (!req.clientAccountId) {
    done(unauthorized('Требуется вход'));
    return;
  }
  done();
}
```

- [ ] **Step 2: Проверить типы**

Run: `npm run typecheck`
Expected: без ошибок (декларация `clientAccountId` совместима с `trainerId` из tenant-context — оба опциональные расширения `FastifyRequest`).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/plugins/client-context.ts
git commit -m "feat(api): плагин client-context (cookie client_sid)"
```

---

### Task 6: Роуты `/api/client/auth/*` + модуль + регистрация

**Files:**

- Create: `apps/api/src/modules/client-auth/client-auth.routes.ts`
- Create: `apps/api/src/modules/client-auth/client-auth.module.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Реализовать роуты**

Create `apps/api/src/modules/client-auth/client-auth.routes.ts`:

```ts
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  clientRegisterRequestSchema,
  clientLoginRequestSchema,
  clientAccountResponseSchema,
  clientMeResponseSchema,
} from '@trener/shared';
import type { ClientAuthService, ClientSession } from './client-auth.service.js';
import { CLIENT_SESSION_COOKIE } from '../../plugins/client-context.js';
import { unauthorized } from '../../errors.js';

const registerResponse = z.object({ account: clientAccountResponseSchema });

export function clientAuthRoutes(
  app: FastifyInstance,
  svc: ClientAuthService,
  isProd: boolean,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  function setSessionCookie(reply: FastifyReply, session: ClientSession): void {
    void reply.setCookie(CLIENT_SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      signed: false,
      expires: session.expiresAt,
    });
  }

  typed.post(
    '/api/client/auth/register',
    { schema: { body: clientRegisterRequestSchema, response: { 201: registerResponse } } },
    async (req, reply) => {
      const { account, session } = await svc.register(req.body);
      setSessionCookie(reply, session);
      void reply.status(201);
      return { account };
    },
  );

  typed.post(
    '/api/client/auth/login',
    { schema: { body: clientLoginRequestSchema, response: { 200: registerResponse } } },
    async (req, reply) => {
      const { account, session } = await svc.login(req.body);
      setSessionCookie(reply, session);
      return { account };
    },
  );

  typed.post(
    '/api/client/auth/logout',
    { schema: { response: { 200: z.object({ ok: z.literal(true) }) } } },
    async (req, reply) => {
      const token = req.cookies[CLIENT_SESSION_COOKIE];
      if (token) await svc.logout(token);
      void reply.clearCookie(CLIENT_SESSION_COOKIE, { path: '/' });
      return { ok: true as const };
    },
  );

  typed.get(
    '/api/client/auth/me',
    { schema: { response: { 200: clientMeResponseSchema } } },
    async (req) => {
      if (!req.clientAccountId) throw unauthorized('Требуется вход');
      return svc.me(req.clientAccountId);
    },
  );
}
```

- [ ] **Step 2: Реализовать модуль**

Create `apps/api/src/modules/client-auth/client-auth.module.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import { makeClientAuthRepo } from './client-auth.repo.js';
import { makeClientAuthService } from './client-auth.service.js';
import { clientContext } from '../../plugins/client-context.js';
import { clientAuthRoutes } from './client-auth.routes.js';

// Возвращает сервис, чтобы composition root мог переиспользовать резолвер скоупа
// в будущих фичевых клиентских модулях (секционные спеки).
export async function registerClientAuthModule(
  app: FastifyInstance,
  deps: { db: Db; clock: Clock; isProd: boolean },
): Promise<ReturnType<typeof makeClientAuthService>> {
  const repo = makeClientAuthRepo(deps.db);
  const svc = makeClientAuthService(repo, deps.clock);

  await app.register(clientContext, { findSession: (id) => repo.findSession(id) });

  await app.register(async (scope) => {
    await scope.register(rateLimit, { max: 20, timeWindow: '1 minute' });
    clientAuthRoutes(scope, svc, deps.isProd);
  });

  return svc;
}
```

- [ ] **Step 3: Зарегистрировать в composition root**

Modify `apps/api/src/app.ts`:

(а) добавить импорт после строки `import { authRoutes } from './modules/auth/auth.routes.js';`:

```ts
import { registerClientAuthModule } from './modules/client-auth/client-auth.module.js';
```

(б) добавить регистрацию **после** блока тренерских auth-роутов (после закрывающей `});` блока `authScope`), до `registerClientsModule(...)`:

```ts
await registerClientAuthModule(app, { db: deps.db, clock, isProd: deps.isProd });
```

- [ ] **Step 4: Проверить типы и общий прогон**

Run: `npm run typecheck`
Expected: без ошибок.
Run: `npm run test -- client-auth`
Expected: PASS (repo skipped без БД, service зелёный).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/client-auth/client-auth.routes.ts apps/api/src/modules/client-auth/client-auth.module.ts apps/api/src/app.ts
git commit -m "feat(api): роуты /api/client/auth и регистрация модуля"
```

---

### Task 7: Изоляционный itest (роуты + изоляция)

**Files:**

- Create: `apps/api/src/modules/client-auth/client-auth.isolation.itest.ts`

- [ ] **Step 1: Падающий itest**

Create `apps/api/src/modules/client-auth/client-auth.isolation.itest.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { createDb } from '../../db/client.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('client-auth (isolation)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: FastifyInstance;

  beforeAll(async () => {
    await db.execute(sql`DELETE FROM client_sessions_auth`);
    await db.execute(sql`DELETE FROM client_accounts`);
    app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await pg.end();
  });

  function cookieFrom(res: { headers: Record<string, unknown> }): string {
    const raw = res.headers['set-cookie'];
    const arr = Array.isArray(raw) ? raw : [String(raw)];
    const c = arr.find((s) => s.startsWith('client_sid='));
    if (!c) throw new Error('нет client_sid');
    return c.split(';')[0]!;
  }

  it('me без cookie → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/client/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('register → me возвращает аккаунт и link=null', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'iso@b.co', password: 'longenough1', firstName: 'И', lastName: 'К' },
    });
    expect(reg.statusCode).toBe(201);
    const cookie = cookieFrom(reg);
    const me = await app.inject({
      method: 'GET',
      url: '/api/client/auth/me',
      headers: { cookie },
    });
    expect(me.statusCode).toBe(200);
    const body = me.json() as { account: { email: string }; link: unknown };
    expect(body.account.email).toBe('iso@b.co');
    expect(body.link).toBeNull();
  });

  it('повторный register того же email → 409', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'iso@b.co', password: 'longenough1', firstName: 'И', lastName: 'К' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('сессия клиента A не даёт доступ под другим токеном', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'b2@b.co', password: 'longenough1', firstName: 'Б', lastName: 'К' },
    });
    const cookieB = cookieFrom(reg);
    const meB = await app.inject({
      method: 'GET',
      url: '/api/client/auth/me',
      headers: { cookie: cookieB },
    });
    expect((meB.json() as { account: { email: string } }).account.email).toBe('b2@b.co');
    const bogus = await app.inject({
      method: 'GET',
      url: '/api/client/auth/me',
      headers: { cookie: 'client_sid=not-a-real-token' },
    });
    expect(bogus.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Запустить — пройти (нужен Postgres)**

PowerShell:

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/trener'; npm run test -- client-auth.isolation
```

Expected: PASS (4 теста). Без БД — skipped.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/client-auth/client-auth.isolation.itest.ts
git commit -m "test(api): изоляционные тесты клиентского auth"
```

---

## Phase 4 — Валидация привязки в `clients`

### Task 8: Тренер не может привязать несуществующий клиентский аккаунт

**Files:**

- Modify: `apps/api/src/modules/clients/clients.module.ts`
- Modify: `apps/api/src/modules/clients/clients.service.ts`
- Modify: `apps/api/src/modules/clients/clients.service.test.ts` (уже существует — интегрируемся в его хелперы)

> Важно: файл `clients.service.test.ts` уже есть и содержит модульные `const deps = { newId: () => 'newid' }`, `fakeRepo`, `fakeFilesRepo`, `fakeStorage`, `makeSvc`. **Не вводить дублирующие объявления** — править существующие.

- [ ] **Step 1: Обновить хелперы + добавить падающие тесты**

Modify `apps/api/src/modules/clients/clients.service.test.ts`:

(а) заменить строку `const deps = { newId: () => 'newid' };` на фабрику с `accountExists` (по умолчанию аккаунт существует — чтобы прочие тесты не ломались):

```ts
function makeDeps(accountExists = vi.fn(() => Promise.resolve(true))) {
  return { newId: () => 'newid', accountExists };
}
const deps = makeDeps();
```

(б) расширить `makeSvc`, чтобы можно было подменить `accountExists` (добавить поле в объект `over` и прокинуть в сервис):

```ts
function makeSvc(
  over: {
    repo?: Partial<ClientsRepo>;
    filesRepo?: Partial<FilesRepo>;
    storage?: Partial<Storage>;
    accountExists?: ReturnType<typeof vi.fn>;
  } = {},
) {
  return makeClientsService(
    fakeRepo(over.repo),
    fakeFilesRepo(over.filesRepo),
    fakeStorage(over.storage),
    over.accountExists ? makeDeps(over.accountExists) : deps,
  );
}
```

(в) добавить два теста внутрь существующего `describe('clients.service', () => { ... })`:

```ts
it('update с несуществующим accountId → 422 CLIENT_ACCOUNT_NOT_FOUND', async () => {
  const accountExists = vi.fn(() => Promise.resolve(false));
  const svc = makeSvc({ accountExists });
  await expect(svc.update('A', 'c1', { accountId: 'ghost' })).rejects.toMatchObject({
    status: 422,
    code: 'CLIENT_ACCOUNT_NOT_FOUND',
  });
  expect(accountExists).toHaveBeenCalledWith('ghost');
});

it('update с accountId=null (отвязка) не проверяет существование', async () => {
  const accountExists = vi.fn(() => Promise.resolve(false));
  const update = vi.fn(() => Promise.resolve(row({ accountId: null })));
  const svc = makeSvc({ repo: { update }, accountExists });
  await svc.update('A', 'c1', { accountId: null });
  expect(accountExists).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Запустить — упасть**

Run: `npm run test -- clients.service`
Expected: FAIL — нет проверки 422 (первый новый тест падает: `update` вернёт row, а не выбросит 422). Тип `accountExists` ещё не в `ClientsDeps` → возможна и ошибка типов.

- [ ] **Step 3: Реализовать в сервисе**

Modify `apps/api/src/modules/clients/clients.service.ts`:

(а) расширить тип `ClientsDeps`:

```ts
export type ClientsDeps = { newId: () => string; accountExists: (id: string) => Promise<boolean> };
```

(б) в методе `update`, **в самом начале** (до сборки `repoPatch`), добавить валидацию непустого `accountId`:

```ts
    async update(
      trainerId: string,
      clientId: string,
      patch: UpdateClientRequest,
    ): Promise<ClientResponse> {
      // Привязка клиентского аккаунта: непустой accountId должен существовать.
      // Пустая строка/null = отвязка, существование не проверяем.
      if (patch.accountId != null && patch.accountId !== '') {
        const exists = await deps.accountExists(patch.accountId);
        if (!exists) {
          throw new AppError(422, 'CLIENT_ACCOUNT_NOT_FOUND', 'Клиентский аккаунт не найден');
        }
      }
      // exactOptionalPropertyTypes: задаём только определённые поля.
      const repoPatch: UpdateClientInput = {};
```

(остальное тело `update` без изменений; `AppError` уже импортирован в файле).

- [ ] **Step 4: Прокинуть зависимость в модуле**

Modify `apps/api/src/modules/clients/clients.module.ts` — заменить создание сервиса так, чтобы прокинуть `accountExists`. Добавить импорт repo клиентского auth и собрать его:

```ts
import { makeClientAuthRepo } from '../client-auth/client-auth.repo.js';
```

и заменить строку `const svc = makeClientsService(...)` на:

```ts
const clientAuthRepo = makeClientAuthRepo(deps.db);
const svc = makeClientsService(repo, filesRepo, deps.storage, {
  newId: deps.clock.newId,
  accountExists: (id) => clientAuthRepo.accountExists(id),
});
```

- [ ] **Step 5: Запустить — пройти + типы**

Run: `npm run test -- clients.service`
Expected: PASS.
Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/clients/clients.service.ts apps/api/src/modules/clients/clients.service.test.ts apps/api/src/modules/clients/clients.module.ts
git commit -m "feat(api): валидация существования клиентского аккаунта при привязке"
```

---

## Phase 5 — Общий пакет темы

### Task 9: Вынести токены Acid Flow в `packages/theme`

**Files:**

- Create: `packages/theme/package.json`
- Create: `packages/theme/theme.css`
- Modify: `apps/web/src/index.css`

- [ ] **Step 1: package.json пакета темы**

Create `packages/theme/package.json`:

```json
{
  "name": "@trener/theme",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    "./theme.css": "./theme.css"
  }
}
```

- [ ] **Step 2: theme.css — перенести `@theme`-блок**

Create `packages/theme/theme.css` — скопировать **дословно** `@theme { ... }`-блок из `apps/web/src/index.css` (строки с токенами `--color-*`, `--font-*`):

```css
/* GYM Acid Flow — токены темы, общие для тренерского и клиентского фронтов. */
@theme {
  /* layout */
  --color-canvas: #000000;
  --color-bg: #0b0c10;
  --color-card: #15171d;
  --color-card-elevated: #1d2029;
  --color-chip: #1f2128;
  --color-line: rgba(255, 255, 255, 0.1);
  --color-line-strong: rgba(255, 255, 255, 0.2);

  /* текст */
  --color-ink: #eeeee8;
  --color-ink-muted: #9a9da6;
  --color-ink-mutedxl: #5e626b;

  /* акценты */
  --color-accent: #d4ff3d;
  --color-accent-on: #0b0c10;
  --color-accent-text: #d4ff3d;
  --color-accent-2: #5c7a0e;

  /* семантика */
  --color-success: #5c7a0e;
  --color-success-soft: #1e2818;
  --color-danger: #e04a2e;
  --color-danger-soft: #3a1c15;
  --color-coral: #ff6e4e;
  --color-amber: #e8b255;

  --font-sans:
    'Space Grotesk', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui,
    sans-serif;
  --font-display: 'Bowlby One', 'Space Grotesk', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', 'Cascadia Mono', Consolas, monospace;
}
```

- [ ] **Step 3: Тренерский index.css — импортировать общий блок**

Modify `apps/web/src/index.css` — заменить весь inline-блок `@theme { ... }` (вместе с комментарием `/* GYM Acid Flow — единая тёмная тема проекта. */`) на импорт сразу после `@import 'tailwindcss';`:

```css
@import 'tailwindcss';
@import '../../../packages/theme/theme.css';
```

Остальное содержимое `index.css` (`:root`, `body`, компонентные классы) — **не трогать**.

- [ ] **Step 4: Сборка тренерского фронта (визуальная нейтральность)**

Run: `npm run build -w @trener/web`
Expected: сборка успешна. (Tailwind v4 инлайнит `@import` относительного CSS и обрабатывает `@theme` из него — токены доступны как раньше.) Бегло проверить, что в `apps/web/dist/assets/*.css` присутствует переменная `--color-accent`.

- [ ] **Step 5: Commit**

```bash
git add packages/theme/package.json packages/theme/theme.css apps/web/src/index.css
git commit -m "refactor(theme): вынести токены Acid Flow в packages/theme"
```

---

## Phase 6 — Скаффолд `apps/web-client`

### Task 10: Конфиги и точка входа

**Files:**

- Create: `apps/web-client/package.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`
- Create: `apps/web-client/src/main.tsx`, `src/index.css`, `src/test/setup.ts`

- [ ] **Step 1: package.json**

Create `apps/web-client/package.json` (порт dev-сервера 5174, чтобы не конфликтовать с тренерским 5173; зависимости — минимум для фундамента):

```json
{
  "name": "@trener/web-client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -b",
    "test": "vitest run"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.62.0",
    "@trener/shared": "*",
    "@trener/theme": "*",
    "lucide-react": "^1.17.0",
    "qrcode.react": "^4.2.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^25.0.1",
    "tailwindcss": "^4.0.0",
    "typescript": "^6.0.3",
    "vite": "^6.0.0",
    "vitest": "^4.1.7"
  }
}
```

- [ ] **Step 2: tsconfig-файлы**

Create `apps/web-client/tsconfig.json`:

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }]
}
```

Create `apps/web-client/tsconfig.app.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "noEmit": true
  },
  "include": ["src"],
  "references": [{ "path": "../../packages/shared" }]
}
```

Create `apps/web-client/tsconfig.node.json` (клон тренерского; конфиг сборщика):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["node"],
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 3: vite.config.ts**

Create `apps/web-client/vite.config.ts` (без `data-loc`-babel — это тренерский dev-инструмент; прокси на тот же API :3001):

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  test: {
    name: 'web-client',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
```

- [ ] **Step 4: index.html**

Create `apps/web-client/index.html` (тот же набор шрифтов, заголовок «Мой тренер»):

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#000000" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Bowlby+One&family=JetBrains+Mono:wght@400;500;700&display=swap"
      rel="stylesheet"
    />
    <title>Мой тренер</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: index.css (импорт общей темы + базовые стили)**

Create `apps/web-client/src/index.css`:

```css
@import 'tailwindcss';
@import '../../../packages/theme/theme.css';

:root {
  color-scheme: dark;
}

html,
body,
#root {
  height: 100%;
}

body {
  margin: 0;
  font-family: var(--font-sans);
  background: var(--color-canvas);
  color: var(--color-ink);
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
  overscroll-behavior-y: contain;
}
```

- [ ] **Step 6: main.tsx (клон тренерского)**

Create `apps/web-client/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false },
  },
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Не найден корневой элемент #root');

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 7: test/setup.ts**

Create `apps/web-client/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 8: Установить зависимости workspace**

Run: `npm install`
Expected: npm подхватывает новый workspace `@trener/web-client`, симлинкует `@trener/shared` и `@trener/theme`. (App.tsx/api ещё нет — сборку погоняем после Task 12.)

- [ ] **Step 9: Commit**

```bash
git add apps/web-client/package.json apps/web-client/tsconfig.json apps/web-client/tsconfig.app.json apps/web-client/tsconfig.node.json apps/web-client/vite.config.ts apps/web-client/index.html apps/web-client/src/main.tsx apps/web-client/src/index.css apps/web-client/src/test/setup.ts package-lock.json
git commit -m "chore(web-client): скаффолд workspace (конфиги, точка входа)"
```

---

### Task 11: API-слой клиентского фронта

**Files:**

- Create: `apps/web-client/src/api/client.ts`
- Create: `apps/web-client/src/api/auth.ts`

- [ ] **Step 1: apiFetch (клон тренерского)**

Create `apps/web-client/src/api/client.ts` — дословный клон `apps/web/src/api/client.ts` (тот же `API_BASE='/api'`, `ApiError`, `apiFetch`). Содержимое идентично; копируем целиком:

```ts
import type { ZodType } from 'zod';

const API_BASE = '/api';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface ApiFetchOptions<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  schema?: ZodType<T>;
}

interface ApiErrorBody {
  error?: unknown;
  code?: unknown;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions<T> = {},
): Promise<T> {
  const { method = 'GET', body, schema } = options;
  const hasBody = body !== undefined;

  const init: RequestInit = { method, credentials: 'include' };
  if (hasBody) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE}${path}`, init);

  if (!res.ok) {
    let code = 'UNKNOWN';
    let message = res.statusText || `Ошибка запроса (${String(res.status)})`;
    try {
      const errBody = (await res.json()) as ApiErrorBody;
      if (typeof errBody.code === 'string') code = errBody.code;
      if (typeof errBody.error === 'string') message = errBody.error;
    } catch {
      // тело не JSON
    }
    throw new ApiError(res.status, code, message);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (text.length === 0) return undefined as T;

  const data: unknown = JSON.parse(text);
  return schema ? schema.parse(data) : (data as T);
}
```

- [ ] **Step 2: auth-хуки**

Create `apps/web-client/src/api/auth.ts`:

```ts
import {
  clientAccountResponseSchema,
  clientMeResponseSchema,
  type ClientLoginRequest,
  type ClientMeResponse,
  type ClientRegisterRequest,
} from '@trener/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, ApiError } from './client';

const accountEnvelope = z.object({ account: clientAccountResponseSchema });

export const clientMeQueryKey = ['client', 'me'] as const;

/** Текущий клиент + привязка. 401 → null (не залогинен), а не ошибка. */
export function useClientMe() {
  return useQuery<ClientMeResponse | null>({
    queryKey: clientMeQueryKey,
    queryFn: async () => {
      try {
        return await apiFetch('/client/auth/me', { schema: clientMeResponseSchema });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
  });
}

export function useClientRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ClientRegisterRequest) =>
      apiFetch('/client/auth/register', { method: 'POST', body: input, schema: accountEnvelope }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientMeQueryKey });
    },
  });
}

export function useClientLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ClientLoginRequest) =>
      apiFetch('/client/auth/login', { method: 'POST', body: input, schema: accountEnvelope }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientMeQueryKey });
    },
  });
}

export function useClientLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch('/client/auth/logout', {
        method: 'POST',
        schema: z.object({ ok: z.literal(true) }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientMeQueryKey });
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web-client/src/api/client.ts apps/web-client/src/api/auth.ts
git commit -m "feat(web-client): api-слой (apiFetch + auth-хуки)"
```

---

### Task 12: Экраны, нижняя навигация и гейт доступа

**Files:**

- Create: `apps/web-client/src/components/BottomNav.tsx`
- Create: `apps/web-client/src/pages/StubPage.tsx`, `LoginPage.tsx`, `RegisterPage.tsx`, `ConnectPage.tsx`
- Create: `apps/web-client/src/App.tsx`

- [ ] **Step 1: StubPage (заглушка секции)**

Create `apps/web-client/src/pages/StubPage.tsx`:

```tsx
export function StubPage({ title }: { title: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-[28px] text-accent">{title}</h1>
      <p className="text-sm text-ink-muted">Скоро</p>
    </div>
  );
}
```

- [ ] **Step 2: BottomNav (нижняя навигация)**

Create `apps/web-client/src/components/BottomNav.tsx`:

```tsx
import { NavLink } from 'react-router-dom';
import { Dumbbell, Calendar, MessageCircle, TrendingUp, User } from 'lucide-react';

const ITEMS = [
  { to: '/', label: 'Тренировки', Icon: Dumbbell, end: true },
  { to: '/calendar', label: 'Календарь', Icon: Calendar, end: false },
  { to: '/chat', label: 'Чат', Icon: MessageCircle, end: false },
  { to: '/progress', label: 'Прогресс', Icon: TrendingUp, end: false },
  { to: '/profile', label: 'Профиль', Icon: User, end: false },
];

export function BottomNav() {
  return (
    <nav className="sticky bottom-0 z-10 flex border-t border-line bg-bg/95 backdrop-blur">
      {ITEMS.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] ${
              isActive ? 'text-accent' : 'text-ink-muted'
            }`
          }
        >
          <Icon size={22} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
```

- [ ] **Step 3: LoginPage**

Create `apps/web-client/src/pages/LoginPage.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useClientLogin } from '../api/auth';
import { ApiError } from '../api/client';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function LoginPage() {
  const login = useClientLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  const errors = {
    email:
      email.trim() === ''
        ? 'Укажите email'
        : EMAIL_RE.test(email.trim())
          ? ''
          : 'Некорректный email',
    password: password === '' ? 'Укажите пароль' : '',
  };
  const hasErrors = errors.email !== '' || errors.password !== '';

  const serverError = login.isError
    ? login.error instanceof ApiError && login.error.status === 401
      ? 'Неверный email или пароль'
      : login.error instanceof ApiError
        ? login.error.message
        : 'Не удалось войти. Попробуйте позже.'
    : '';

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (hasErrors) {
      setShowErrors(true);
      return;
    }
    login.mutate({ email: email.trim(), password });
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[430px] flex-col justify-center gap-6 bg-bg px-6">
      <h1 className="font-[family-name:var(--font-display)] text-[40px] leading-none tracking-[-0.02em] text-accent">
        Вход
      </h1>
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-muted">Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`rounded-xl border bg-chip px-3 py-2.5 text-base text-ink outline-none focus:border-accent ${
              showErrors && errors.email ? 'border-danger' : 'border-line'
            }`}
          />
          {showErrors && errors.email && (
            <span className="text-[12px] text-danger">{errors.email}</span>
          )}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-muted">Пароль</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`rounded-xl border bg-chip px-3 py-2.5 text-base text-ink outline-none focus:border-accent ${
              showErrors && errors.password ? 'border-danger' : 'border-line'
            }`}
          />
          {showErrors && errors.password && (
            <span className="text-[12px] text-danger">{errors.password}</span>
          )}
        </label>
        {serverError && (
          <p className="text-sm text-danger" role="alert">
            {serverError}
          </p>
        )}
        <button
          type="submit"
          disabled={login.isPending}
          className="rounded-xl bg-accent py-3 font-semibold text-accent-on disabled:opacity-60"
        >
          {login.isPending ? 'Входим…' : 'Войти'}
        </button>
      </form>
      <p className="text-sm text-ink-muted">
        Нет аккаунта?{' '}
        <Link to="/register" className="font-medium text-accent">
          Регистрация
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 4: RegisterPage**

Create `apps/web-client/src/pages/RegisterPage.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useClientRegister } from '../api/auth';
import { ApiError } from '../api/client';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function RegisterPage() {
  const reg = useClientRegister();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  const emailTaken = reg.error instanceof ApiError && reg.error.code === 'EMAIL_TAKEN';

  const errors = {
    firstName: firstName.trim() === '' ? 'Укажите имя' : '',
    lastName: lastName.trim() === '' ? 'Укажите фамилию' : '',
    email:
      email.trim() === ''
        ? 'Укажите email'
        : EMAIL_RE.test(email.trim())
          ? ''
          : 'Некорректный email',
    password: password.length < 8 ? 'Пароль не короче 8 символов' : '',
  };
  const hasErrors = Object.values(errors).some((v) => v !== '');
  const emailError =
    (showErrors ? errors.email : '') || (emailTaken ? 'Email уже зарегистрирован' : '');
  const serverError =
    reg.isError && !emailTaken
      ? reg.error instanceof ApiError
        ? reg.error.message
        : 'Не удалось зарегистрироваться. Попробуйте позже.'
      : '';

  function field(
    label: string,
    value: string,
    set: (v: string) => void,
    error: string,
    type = 'text',
    autoComplete = 'off',
  ) {
    return (
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-muted">{label}</span>
        <input
          type={type}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => set(e.target.value)}
          className={`rounded-xl border bg-chip px-3 py-2.5 text-base text-ink outline-none focus:border-accent ${
            error ? 'border-danger' : 'border-line'
          }`}
        />
        {error && <span className="text-[12px] text-danger">{error}</span>}
      </label>
    );
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (hasErrors) {
      setShowErrors(true);
      return;
    }
    reg.mutate({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      password,
    });
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[430px] flex-col justify-center gap-6 bg-bg px-6 py-8">
      <h1 className="font-[family-name:var(--font-display)] text-[36px] leading-none tracking-[-0.02em] text-accent">
        Регистрация
      </h1>
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        {field(
          'Имя',
          firstName,
          setFirstName,
          showErrors ? errors.firstName : '',
          'text',
          'given-name',
        )}
        {field(
          'Фамилия',
          lastName,
          setLastName,
          showErrors ? errors.lastName : '',
          'text',
          'family-name',
        )}
        {field('Email', email, setEmail, emailError, 'email', 'email')}
        {field(
          'Пароль',
          password,
          setPassword,
          showErrors ? errors.password : '',
          'password',
          'new-password',
        )}
        {serverError && (
          <p className="text-sm text-danger" role="alert">
            {serverError}
          </p>
        )}
        <button
          type="submit"
          disabled={reg.isPending}
          className="rounded-xl bg-accent py-3 font-semibold text-accent-on disabled:opacity-60"
        >
          {reg.isPending ? 'Создаём…' : 'Создать аккаунт'}
        </button>
      </form>
      <p className="text-sm text-ink-muted">
        Уже есть аккаунт?{' '}
        <Link to="/login" className="font-medium text-accent">
          Войти
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 5: ConnectPage (экран «Подключение»)**

Create `apps/web-client/src/pages/ConnectPage.tsx` — показывает код (id аккаунта) + QR, поллит `me`, кнопка «Выйти»:

```tsx
import { QRCodeSVG } from 'qrcode.react';
import { useClientLogout } from '../api/auth';

export function ConnectPage({ code }: { code: string }) {
  const logout = useClientLogout();
  return (
    <div className="mx-auto flex min-h-screen max-w-[430px] flex-col justify-center gap-6 bg-bg px-6 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-[28px] leading-tight text-accent">
        Подключение
      </h1>
      <p className="text-sm text-ink-muted">
        Передай этот код тренеру — он подключит тебя, и появятся твои тренировки.
      </p>
      <div className="mx-auto rounded-2xl bg-ink p-4">
        <QRCodeSVG value={code} size={180} bgColor="#eeeee8" fgColor="#0b0c10" />
      </div>
      <div className="rounded-xl border border-line bg-chip px-4 py-3 font-mono text-sm break-all text-ink">
        {code}
      </div>
      <button
        type="button"
        onClick={() => logout.mutate()}
        className="text-sm font-medium text-ink-muted"
      >
        Выйти
      </button>
    </div>
  );
}
```

- [ ] **Step 6: App.tsx (гейт + маршруты)**

Create `apps/web-client/src/App.tsx`:

```tsx
import { Navigate, Route, Routes } from 'react-router-dom';
import { useClientMe } from './api/auth';
import { BottomNav } from './components/BottomNav';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ConnectPage } from './pages/ConnectPage';
import { StubPage } from './pages/StubPage';

export function App() {
  const me = useClientMe();

  if (me.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg text-ink-muted">
        Загрузка…
      </div>
    );
  }

  // Не залогинен → экраны входа/регистрации.
  if (!me.data) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Залогинен, но не привязан тренером → экран кода.
  if (me.data.link === null) {
    return <ConnectPage code={me.data.account.id} />;
  }

  // Привязан → основное приложение с нижней навигацией и заглушками секций.
  return (
    <div className="mx-auto flex min-h-screen max-w-[430px] flex-col bg-bg">
      <Routes>
        <Route path="/" element={<StubPage title="Тренировки" />} />
        <Route path="/calendar" element={<StubPage title="Календарь" />} />
        <Route path="/chat" element={<StubPage title="Чат" />} />
        <Route path="/progress" element={<StubPage title="Прогресс" />} />
        <Route path="/profile" element={<StubPage title="Профиль" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </div>
  );
}
```

- [ ] **Step 7: Сборка и типы клиентского фронта**

Run: `npm run build -w @trener/web-client`
Expected: успешная сборка (tsc + vite), `apps/web-client/dist` создан.

- [ ] **Step 8: Commit**

```bash
git add apps/web-client/src/components apps/web-client/src/pages apps/web-client/src/App.tsx
git commit -m "feat(web-client): экраны входа, подключения, навигация и гейт доступа"
```

---

### Task 13: Smoke-тест гейта доступа

**Files:**

- Create: `apps/web-client/src/App.test.tsx`

- [ ] **Step 1: Падающий тест**

Create `apps/web-client/src/App.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import * as auth from './api/auth';

vi.mock('./api/auth');

function renderApp() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('App gate', () => {
  beforeEach(() => {
    vi.mocked(auth.useClientLogout).mockReturnValue({ mutate: vi.fn() } as never);
  });

  it('не залогинен → экран входа', () => {
    vi.mocked(auth.useClientMe).mockReturnValue({ isLoading: false, data: null } as never);
    renderApp();
    expect(screen.getByRole('heading', { name: 'Вход' })).toBeInTheDocument();
  });

  it('залогинен без привязки → экран подключения с кодом', () => {
    vi.mocked(auth.useClientMe).mockReturnValue({
      isLoading: false,
      data: {
        account: {
          id: 'CODE-123',
          email: 'a@b.co',
          firstName: 'И',
          lastName: 'К',
          avatarFileId: null,
        },
        link: null,
      },
    } as never);
    renderApp();
    expect(screen.getByText('Подключение')).toBeInTheDocument();
    expect(screen.getByText('CODE-123')).toBeInTheDocument();
  });

  it('привязан → нижняя навигация', () => {
    vi.mocked(auth.useClientMe).mockReturnValue({
      isLoading: false,
      data: {
        account: { id: 'ca1', email: 'a@b.co', firstName: 'И', lastName: 'К', avatarFileId: null },
        link: { trainerId: 't1', clientId: 'cl1' },
      },
    } as never);
    renderApp();
    expect(screen.getByText('Тренировки')).toBeInTheDocument();
    expect(screen.getByText('Профиль')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Запустить — пройти**

Run: `npm run test -w @trener/web-client`
Expected: PASS (3 теста).

- [ ] **Step 3: Commit**

```bash
git add apps/web-client/src/App.test.tsx
git commit -m "test(web-client): smoke-тест гейта доступа"
```

---

## Phase 7 — Docker / деплой

### Task 14: Образ и nginx для клиентского фронта

**Files:**

- Create: `apps/web-client/Dockerfile`
- Create: `nginx/web-client.conf`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Dockerfile (клон тренерского, свой nginx-конфиг)**

Create `apps/web-client/Dockerfile`:

```dockerfile
# --- build ---
FROM node:20-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/theme/package.json packages/theme/
COPY apps/web-client/package.json apps/web-client/
RUN npm ci --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/theme packages/theme
COPY apps/web-client apps/web-client
RUN npm run build -w @trener/shared && npm run build -w @trener/web-client

# --- runtime ---
FROM nginx:1.27-alpine AS runtime
COPY --from=build /repo/apps/web-client/dist /usr/share/nginx/html
COPY nginx/web-client.conf /etc/nginx/nginx.conf
EXPOSE 80
```

- [ ] **Step 2: nginx-конфиг (клон тренерского)**

Create `nginx/web-client.conf` — идентичен `nginx/nginx.conf` (тот же `proxy_pass http://api:3001`, кэш ассетов, no-cache на index.html):

```nginx
events {}
http {
  include       /etc/nginx/mime.types;
  default_type  application/octet-stream;
  sendfile      on;

  server {
    listen 80;

    location /api/ {
      proxy_pass http://api:3001;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $remote_addr;
    }

    location /assets/ {
      root /usr/share/nginx/html;
      access_log off;
      expires 1y;
      add_header Cache-Control "public, immutable";
      try_files $uri =404;
    }

    location / {
      root /usr/share/nginx/html;
      try_files $uri $uri/ /index.html;
      add_header Cache-Control "no-cache, no-store, must-revalidate";
      expires -1;
    }
  }
}
```

- [ ] **Step 3: Сервис в docker-compose**

Modify `docker-compose.yml` — добавить сервис после `nginx:` (клиентский фронт на хост-порту `8081`):

```yaml
web-client:
  image: ${WEB_CLIENT_IMAGE:-trener-web-client:local}
  build: { context: ., dockerfile: apps/web-client/Dockerfile }
  ports: ['8081:80']
  depends_on: [api]
```

- [ ] **Step 4: Проверить сборку образа**

Run: `docker compose build web-client`
Expected: образ собирается без ошибок (shared+theme+web-client билдятся внутри).

- [ ] **Step 5: Поднять и проверить**

PowerShell:

```powershell
$env:COOKIE_SECRET = ('x' * 40); docker compose up -d postgres api web-client
```

Затем открыть `http://localhost:8081` — должен отрендериться экран «Вход». Зарегистрироваться → увидеть экран «Подключение» с кодом и QR.

- [ ] **Step 6: Commit**

```bash
git add apps/web-client/Dockerfile nginx/web-client.conf docker-compose.yml
git commit -m "build(web-client): docker-образ и сервис в compose"
```

---

## Финальная проверка

- [ ] **Полный прогон гейта качества**

Run: `npm run check`
Expected: format + lint + typecheck + test зелёные (itest-ы skipped без `DATABASE_URL`).

- [ ] **Прогон с БД (опционально, локальный Postgres)**

PowerShell:

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/trener'; npm run test
```

Expected: включая `client-auth.repo`, `client-auth.isolation` — всё зелёное.

- [ ] **Ручная проверка связки** (Postgres + api подняты): зарегистрировать клиента в `:8081`, скопировать код, в тренерском фронте `:8080` открыть карточку клиента → «Подключить» → ввести код → клиентский фронт после refetch `me` показывает нижнюю навигацию.

---

## Self-review (выполнено при написании)

- **Покрытие спеки:** таблицы (Task 2), client-auth модуль (Tasks 3–7), плагин cookie (Task 5), резолвер (Task 3 repo + Task 4 service), валидация привязки 422 (Task 8), общий theme (Task 9), скаффолд+гейт+навигация (Tasks 10–13), docker (Task 14). Контракты `EMAIL_TAKEN`/401/`NOT_LINKED`/`CLIENT_ACCOUNT_NOT_FOUND` — `NOT_LINKED` относится к фичевым роутам (секционные спеки), в фундаменте не используется: гейт строится на `link === null` из `me`. Это согласовано со спекой (раздел «Обработка ошибок» помечает `NOT_LINKED` как для фич).
- **Типы:** `ClientAuthService`/`ClientSession` из service используются в routes; `ClientMeResponse`/`ClientAccountResponse`/`ClientLink` из shared; repo-методы (`findScopeByAccountId`, `accountExists`) согласованы между repo, service и clients.module. Имена едины.
- **Плейсхолдеры:** нет — каждый шаг содержит полный код/команду/ожидаемый результат.
