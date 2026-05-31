# Фаза 3: Доменное ядро — clients + trainer_clients (M:N) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Первый доменный модуль `clients`: тренер ведёт своих клиентов как записи. Связь тренер↔клиент — M:N (`trainer_clients`), все данные скоупятся по `trainerId`. Это **эталон scope-изоляции** для всех последующих доменных модулей: каждый repo-запрос фильтруется по `trainerId`, доступ к чужому клиенту → 404, guard `requireClientAccess`.

**Architecture:** Слои `routes → service → repo` в `apps/api/src/modules/clients/`. Изоляция прошита в repo (все методы принимают `trainerId`). `requireClientAccess` — preHandler-фабрика (проверяет связь через `trainer_clients`, иначе 404), seam для вложенных ресурсов Фазы 4. Регистрация модуля вынесена в `registerClientsModule(app, deps)` (composition-root остаётся читаемым). «Удаление» клиента = отвязать (удалить строку `trainer_clients`); архив = `status='archived'` на связи. Поля клиента минимальные, расширяемые.

**Tech Stack:** Fastify 5, Drizzle ORM, PostgreSQL, Zod (через type-provider), Vitest. Всё уже стоит из Фаз 1–2.

**Решения по объёму (зафиксированы владельцем):**

- «Удаление» клиента = **отвязать + архив статусом** (человек-запись и данные других тренеров сохраняются; жёсткого удаления персоны нет).
- Поля клиента — **минимальные**: `first_name`, `last_name`, `phone` (персона) + `notes`, `status` (профиль у тренера). Остальное (дата рождения, рост, доп. контакты, медкарта, замеры) — позже.
- Приложение только тренерское (клиентских аккаунтов нет — клиент это запись).

---

## Контекст из Фаз 1–2 (что уже есть)

- `buildApp(deps: { db, cookieSecret, isProd }): Promise<FastifyInstance>` (`apps/api/src/app.ts`) — composition root; auth-модуль зарегистрирован в дочернем scope с rate-limit.
- `tenant-context` (`apps/api/src/plugins/tenant-context.ts`): onRequest кладёт `request.trainerId`; экспортирует `requireAuth` (preHandler → 401 без trainerId) и `SESSION_COOKIE`.
- `errors.ts`: `AppError`, `notFound` (404), `unauthorized` (401), `forbidden` (403).
- `createDb(url) → { db, sql }`, тип `Db` (`apps/api/src/db/client.ts`).
- `apps/api/src/db/schema.ts`: `schemaMeta`, `trainers`, `sessionsAuth`.
- Паттерн модуля (эталон из auth): `makeXxxRepo(db)`, `makeXxxService(repo, deps)`, `xxxRoutes(app, svc, ...)`, Zod-контракты в `@trener/shared`.
- Тесты: `*.test.ts` (unit), `*.itest.ts` (integration, skipIf без `DATABASE_URL`, гоняются с Docker-Postgres). Type-provider валидирует/сериализует роуты.
- Локально `core.autocrlf=false` + `.gitattributes` (LF). Коммиты — Conventional Commits (хуки), subject нижний регистр, тело через файл БЕЗ BOM + `git commit -F`.

---

## Структура файлов (создаётся/меняется в этой фазе)

```text
packages/shared/src/
  clients.ts                       # Zod: create/update request, client response, list  [NEW]
  index.ts                         # + реэкспорт clients                                 [MOD]

apps/api/src/
  db/schema.ts                     # + clients, trainerClients                           [MOD]
  app.ts                           # + registerClientsModule(app, { db })                [MOD]
  plugins/
    require-client-access.ts       # preHandler-фабрика (проверка связи → 404)           [NEW]
    require-client-access.test.ts                                                         [NEW]
  modules/clients/
    clients.repo.ts                # scoped по trainerId (Drizzle)                        [NEW]
    clients.repo.itest.ts          # integration (per-test cleanup)                       [NEW]
    clients.service.ts             # create/list/get/update/archive/unlink               [NEW]
    clients.service.test.ts        # unit (типизированный мок repo)                       [NEW]
    clients.routes.ts              # CRUD + registerClientsModule                         [NEW]
    clients.routes.itest.ts        # integration (CRUD через HTTP с auth-cookie)          [NEW]
    clients.isolation.itest.ts     # тренер A ≠ тренер B → 404; без auth → 401            [NEW]
```

---

### Task 1: Схема clients + trainer_clients + миграция

**Files:**

- Modify: `apps/api/src/db/schema.ts`
- Test: `apps/api/src/db/clients-schema.itest.ts`

- [ ] **Step 1: Добавить таблицы в `apps/api/src/db/schema.ts`**

Дописать (не трогая существующие `schemaMeta`/`trainers`/`sessionsAuth`); добавить нужные импорты (`primaryKey`):

```ts
import { pgTable, text, timestamp, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core';

// Человек-клиент (общая идентичность, БЕЗ учётки — клиент не логинится).
export const clients = pgTable('clients', {
  id: text('id').primaryKey(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  phone: text('phone'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Связь тренер↔клиент (M:N) + профиль клиента глазами этого тренера.
export const trainerClients = pgTable(
  'trainer_clients',
  {
    trainerId: text('trainer_id')
      .notNull()
      .references(() => trainers.id, { onDelete: 'cascade' }),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    notes: text('notes'),
    // 'active' | 'archived' — архив через статус; «удаление» = разрыв связи (delete строки).
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.trainerId, t.clientId] })],
);
```

- [ ] **Step 2: Сгенерировать миграцию**

Run: `npm --prefix apps/api run db:generate`
Expected: новый `apps/api/drizzle/0002_*.sql` с `CREATE TABLE "clients"` и `CREATE TABLE "trainer_clients"` (composite PK, два FK с `ON DELETE cascade`).

- [ ] **Step 3: Падающий интеграционный тест (`apps/api/src/db/clients-schema.itest.ts`)**

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from './client.js';
import { trainers, clients, trainerClients } from './schema.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('clients/trainer_clients schema (integration)', () => {
  const { db, sql: pg } = createDb(url!);

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM trainers`);
  });
  afterAll(async () => {
    await pg.end();
  });

  it('связывает клиента с тренером (M:N) и читает связь', async () => {
    await db.insert(trainers).values({
      id: 'tr1',
      email: 't@b.co',
      passwordHash: 'h',
      firstName: 'Тр',
      lastName: 'Ен',
    });
    await db.insert(clients).values({ id: 'c1', firstName: 'Кли', lastName: 'Ент' });
    await db.insert(trainerClients).values({ trainerId: 'tr1', clientId: 'c1', status: 'active' });
    const rows = await db.select().from(trainerClients);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('active');
  });
});
```

- [ ] **Step 4: Применить миграцию к тестовой БД и прогнать**

Run (PowerShell):

```
docker run --rm -d --name trener-pg-p3 -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=trener_test -p 5435:5432 postgres:16
$env:DATABASE_URL='postgres://postgres:pg@localhost:5435/trener_test'
npm --prefix apps/api run db:migrate
npx vitest run apps/api/src/db/clients-schema.itest.ts
```

Expected: миграции применены; тест PASS (1). Затем `docker stop trener-pg-p3`.

- [ ] **Step 5: `npm run check` (без DATABASE_URL) → exit 0. Commit**

```
feat(api): схема clients + trainer_clients (M:N), миграция
```

---

### Task 2: Контракты clients в `@trener/shared`

**Files:**

- Create: `packages/shared/src/clients.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/clients.test.ts`

- [ ] **Step 1: Падающий тест (`packages/shared/src/clients.test.ts`)**

```ts
import { describe, it, expect } from 'vitest';
import { createClientRequestSchema, updateClientRequestSchema } from './clients.js';

describe('clients schemas', () => {
  it('принимает корректное создание', () => {
    const r = createClientRequestSchema.parse({
      firstName: '  Алина  ',
      lastName: 'Кузнецова',
      phone: '+7900',
      notes: 'новичок',
    });
    expect(r.firstName).toBe('Алина'); // trim
  });

  it('отклоняет пустое имя', () => {
    expect(() => createClientRequestSchema.parse({ firstName: '', lastName: 'X' })).toThrow();
  });

  it('update допускает частичные поля и статус', () => {
    const r = updateClientRequestSchema.parse({ status: 'archived' });
    expect(r.status).toBe('archived');
  });

  it('update отклоняет неизвестный статус', () => {
    expect(() => updateClientRequestSchema.parse({ status: 'deleted' })).toThrow();
  });
});
```

- [ ] **Step 2: FAIL.** Run: `npx vitest run packages/shared/src/clients.test.ts`

- [ ] **Step 3: Реализация (`packages/shared/src/clients.ts`)**

```ts
import { z } from 'zod';

export const clientStatusSchema = z.enum(['active', 'archived']);
export type ClientStatus = z.infer<typeof clientStatusSchema>;

const name = z.string().trim().min(1).max(100);
const phone = z.string().trim().max(30).nullish();
const notes = z.string().trim().max(2000).nullish();

export const createClientRequestSchema = z.object({
  firstName: name,
  lastName: name,
  phone,
  notes,
});
export type CreateClientRequest = z.infer<typeof createClientRequestSchema>;

export const updateClientRequestSchema = z
  .object({
    firstName: name,
    lastName: name,
    phone,
    notes,
    status: clientStatusSchema,
  })
  .partial();
export type UpdateClientRequest = z.infer<typeof updateClientRequestSchema>;

export const clientResponseSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable(),
  notes: z.string().nullable(),
  status: clientStatusSchema,
  createdAt: z.string(),
});
export type ClientResponse = z.infer<typeof clientResponseSchema>;

export const clientListResponseSchema = z.object({ clients: z.array(clientResponseSchema) });
export type ClientListResponse = z.infer<typeof clientListResponseSchema>;
```

- [ ] **Step 4: Реэкспорт (`packages/shared/src/index.ts`)** — добавить:

```ts
export * from './clients.js';
```

- [ ] **Step 5: PASS. `npm run check` → exit 0. Commit**

```
feat(shared): контракты clients (create/update/response)
```

---

### Task 3: `clients.repo.ts` (scope по trainerId) + интеграционный тест

**Files:**

- Create: `apps/api/src/modules/clients/clients.repo.ts`
- Test: `apps/api/src/modules/clients/clients.repo.itest.ts`

- [ ] **Step 1: Реализация repo (`clients.repo.ts`)**

```ts
import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { clients, trainerClients } from '../../db/schema.js';
import type { ClientStatus } from '@trener/shared';

export type ClientRow = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  notes: string | null;
  status: ClientStatus;
  createdAt: Date;
};

export type CreateClientInput = {
  clientId: string;
  trainerId: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  notes?: string | null;
};

export type UpdateClientInput = {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  notes?: string | null;
  status?: ClientStatus;
};

export function makeClientsRepo(db: Db) {
  // Возвращает клиента в scope тренера (join clients × trainer_clients), либо null.
  async function getForTrainer(trainerId: string, clientId: string): Promise<ClientRow | null> {
    const [row] = await db
      .select({
        id: clients.id,
        firstName: clients.firstName,
        lastName: clients.lastName,
        phone: clients.phone,
        notes: trainerClients.notes,
        status: trainerClients.status,
        createdAt: trainerClients.createdAt,
      })
      .from(trainerClients)
      .innerJoin(clients, eq(clients.id, trainerClients.clientId))
      .where(and(eq(trainerClients.trainerId, trainerId), eq(trainerClients.clientId, clientId)));
    return (row as ClientRow | undefined) ?? null;
  }

  return {
    getForTrainer,

    async isLinked(trainerId: string, clientId: string): Promise<boolean> {
      const [row] = await db
        .select({ clientId: trainerClients.clientId })
        .from(trainerClients)
        .where(and(eq(trainerClients.trainerId, trainerId), eq(trainerClients.clientId, clientId)));
      return !!row;
    },

    async create(input: CreateClientInput): Promise<ClientRow> {
      await db.insert(clients).values({
        id: input.clientId,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone ?? null,
      });
      await db.insert(trainerClients).values({
        trainerId: input.trainerId,
        clientId: input.clientId,
        notes: input.notes ?? null,
        status: 'active',
      });
      const row = await getForTrainer(input.trainerId, input.clientId);
      if (!row) throw new Error('insert failed');
      return row;
    },

    async listByTrainer(trainerId: string): Promise<ClientRow[]> {
      const rows = await db
        .select({
          id: clients.id,
          firstName: clients.firstName,
          lastName: clients.lastName,
          phone: clients.phone,
          notes: trainerClients.notes,
          status: trainerClients.status,
          createdAt: trainerClients.createdAt,
        })
        .from(trainerClients)
        .innerJoin(clients, eq(clients.id, trainerClients.clientId))
        .where(eq(trainerClients.trainerId, trainerId));
      return rows as ClientRow[];
    },

    async update(
      trainerId: string,
      clientId: string,
      patch: UpdateClientInput,
    ): Promise<ClientRow | null> {
      const personPatch: Partial<{ firstName: string; lastName: string; phone: string | null }> =
        {};
      if (patch.firstName !== undefined) personPatch.firstName = patch.firstName;
      if (patch.lastName !== undefined) personPatch.lastName = patch.lastName;
      if (patch.phone !== undefined) personPatch.phone = patch.phone;
      const linkPatch: Partial<{ notes: string | null; status: ClientStatus }> = {};
      if (patch.notes !== undefined) linkPatch.notes = patch.notes;
      if (patch.status !== undefined) linkPatch.status = patch.status;

      if (Object.keys(personPatch).length > 0) {
        await db.update(clients).set(personPatch).where(eq(clients.id, clientId));
      }
      if (Object.keys(linkPatch).length > 0) {
        await db
          .update(trainerClients)
          .set(linkPatch)
          .where(
            and(eq(trainerClients.trainerId, trainerId), eq(trainerClients.clientId, clientId)),
          );
      }
      return getForTrainer(trainerId, clientId);
    },

    // «Удаление» = разрыв связи (персона и данные других тренеров сохраняются).
    async unlink(trainerId: string, clientId: string): Promise<boolean> {
      const res = await db
        .delete(trainerClients)
        .where(and(eq(trainerClients.trainerId, trainerId), eq(trainerClients.clientId, clientId)))
        .returning({ clientId: trainerClients.clientId });
      return res.length > 0;
    },
  };
}

export type ClientsRepo = ReturnType<typeof makeClientsRepo>;
```

- [ ] **Step 2: Падающий интеграционный тест (`clients.repo.itest.ts`)** — с per-test изоляцией (`beforeEach` чистит):

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { trainers } from '../../db/schema.js';
import { makeClientsRepo } from './clients.repo.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('clients.repo (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  const repo = makeClientsRepo(db);

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM trainers`);
    await db.insert(trainers).values([
      { id: 'A', email: 'a@b.co', passwordHash: 'h', firstName: 'A', lastName: 'A' },
      { id: 'B', email: 'b@b.co', passwordHash: 'h', firstName: 'B', lastName: 'B' },
    ]);
  });
  afterAll(async () => {
    await pg.end();
  });

  it('create + listByTrainer видит только своих', async () => {
    await repo.create({ clientId: 'c1', trainerId: 'A', firstName: 'Кли', lastName: 'Ент' });
    expect(await repo.listByTrainer('A')).toHaveLength(1);
    expect(await repo.listByTrainer('B')).toHaveLength(0);
  });

  it('getForTrainer изолирован по тренеру', async () => {
    await repo.create({ clientId: 'c1', trainerId: 'A', firstName: 'Кли', lastName: 'Ент' });
    expect(await repo.getForTrainer('A', 'c1')).not.toBeNull();
    expect(await repo.getForTrainer('B', 'c1')).toBeNull(); // чужой тренер не видит
  });

  it('update меняет персону и профиль; unlink рвёт связь', async () => {
    await repo.create({ clientId: 'c1', trainerId: 'A', firstName: 'Кли', lastName: 'Ент' });
    const upd = await repo.update('A', 'c1', {
      firstName: 'Новое',
      status: 'archived',
      notes: 'n',
    });
    expect(upd?.firstName).toBe('Новое');
    expect(upd?.status).toBe('archived');
    expect(await repo.unlink('A', 'c1')).toBe(true);
    expect(await repo.getForTrainer('A', 'c1')).toBeNull();
  });
});
```

- [ ] **Step 3: Прогнать против Docker-Postgres**

Run (PowerShell):

```
docker run --rm -d --name trener-pg-p3 -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=trener_test -p 5435:5432 postgres:16
$env:DATABASE_URL='postgres://postgres:pg@localhost:5435/trener_test'
npm --prefix apps/api run db:migrate
npx vitest run apps/api/src/modules/clients/clients.repo.itest.ts
```

Expected: PASS (3). Затем `docker stop trener-pg-p3`.

- [ ] **Step 4: `npm run check` → exit 0. Commit**

```
feat(api): clients.repo со scope-изоляцией по trainerId
```

---

### Task 4: `requireClientAccess` (preHandler-фабрика) + тест

**Files:**

- Create: `apps/api/src/plugins/require-client-access.ts`
- Test: `apps/api/src/plugins/require-client-access.test.ts`

- [ ] **Step 1: Падающий тест (`require-client-access.test.ts`)**

```ts
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { makeRequireClientAccess } from './require-client-access.js';

function build(isLinked: (t: string, c: string) => Promise<boolean>) {
  const app = Fastify();
  // эмулируем tenant-context: проставляем trainerId до guard
  app.addHook('onRequest', (req, _r, done) => {
    req.trainerId = 'A';
    done();
  });
  const guard = makeRequireClientAccess({ isLinked });
  app.get('/clients/:id', { preHandler: guard }, () => ({ ok: true }));
  return app;
}

describe('requireClientAccess', () => {
  it('404 если связь не найдена', async () => {
    const app = build(async () => false);
    const res = await app.inject({ method: 'GET', url: '/clients/x' });
    expect(res.statusCode).toBe(404);
  });

  it('пропускает если связь есть', async () => {
    const app = build(async () => true);
    const res = await app.inject({ method: 'GET', url: '/clients/x' });
    expect(res.statusCode).toBe(200);
  });
});
```

- [ ] **Step 2: FAIL.** Run: `npx vitest run apps/api/src/plugins/require-client-access.test.ts`

- [ ] **Step 3: Реализация (`require-client-access.ts`)**

```ts
import type { FastifyReply, FastifyRequest } from 'fastify';
import { notFound, unauthorized } from '../errors.js';

type LinkChecker = { isLinked: (trainerId: string, clientId: string) => Promise<boolean> };

// Фабрика guard'а: пускает, только если текущий тренер связан с клиентом из params.id.
// Иначе 404 (не раскрываем существование чужого клиента). Seam для вложенных
// ресурсов Фазы 4 (тренировки/занятия под клиентом).
export function makeRequireClientAccess(checker: LinkChecker) {
  return async function requireClientAccess(
    req: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    if (!req.trainerId) throw unauthorized('Требуется вход');
    const { id } = req.params as { id?: string };
    if (!id || !(await checker.isLinked(req.trainerId, id))) {
      throw notFound('Клиент не найден');
    }
  };
}
```

- [ ] **Step 4: PASS. Commit**

Run: `npx vitest run apps/api/src/plugins/require-client-access.test.ts` → PASS.

```
feat(api): requireClientAccess guard (404 на чужого клиента)
```

---

### Task 5: `clients.service.ts` + unit-тесты (типизированный мок repo)

**Files:**

- Create: `apps/api/src/modules/clients/clients.service.ts`
- Test: `apps/api/src/modules/clients/clients.service.test.ts`

- [ ] **Step 1: Падающий unit-тест (`clients.service.test.ts`)** — мок типизирован как `ClientsRepo` (carry-forward: без `as never`):

```ts
import { describe, it, expect, vi } from 'vitest';
import type { ClientsRepo, ClientRow } from './clients.repo.js';
import { makeClientsService } from './clients.service.js';

function row(over: Partial<ClientRow> = {}): ClientRow {
  return {
    id: 'c1',
    firstName: 'Кли',
    lastName: 'Ент',
    phone: null,
    notes: null,
    status: 'active',
    createdAt: new Date(0),
    ...over,
  };
}

function fakeRepo(over: Partial<ClientsRepo> = {}): ClientsRepo {
  return {
    getForTrainer: vi.fn(() => Promise.resolve(null)),
    isLinked: vi.fn(() => Promise.resolve(false)),
    create: vi.fn(() => Promise.resolve(row())),
    listByTrainer: vi.fn(() => Promise.resolve([])),
    update: vi.fn(() => Promise.resolve(null)),
    unlink: vi.fn(() => Promise.resolve(false)),
    ...over,
  };
}

describe('clients.service', () => {
  it('create генерирует id и зовёт repo.create со scope тренера', async () => {
    const repo = fakeRepo();
    const svc = makeClientsService(repo, { newId: () => 'newid' });
    const res = await svc.create('A', {
      firstName: 'Кли',
      lastName: 'Ент',
      phone: null,
      notes: null,
    });
    expect(res.id).toBe('c1');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'newid', trainerId: 'A', firstName: 'Кли' }),
    );
  });

  it('get бросает 404, если repo вернул null', async () => {
    const svc = makeClientsService(fakeRepo(), { newId: () => 'x' });
    await expect(svc.get('A', 'missing')).rejects.toMatchObject({ status: 404 });
  });

  it('update бросает 404, если repo вернул null', async () => {
    const svc = makeClientsService(fakeRepo(), { newId: () => 'x' });
    await expect(svc.update('A', 'missing', { notes: 'n' })).rejects.toMatchObject({ status: 404 });
  });

  it('unlink бросает 404, если связи не было', async () => {
    const svc = makeClientsService(fakeRepo({ unlink: vi.fn(() => Promise.resolve(false)) }), {
      newId: () => 'x',
    });
    await expect(svc.unlink('A', 'missing')).rejects.toMatchObject({ status: 404 });
  });
});
```

- [ ] **Step 2: FAIL.** Run: `npx vitest run apps/api/src/modules/clients/clients.service.test.ts`

- [ ] **Step 3: Реализация (`clients.service.ts`)**

```ts
import type { ClientsRepo, ClientRow } from './clients.repo.js';
import type { ClientResponse, CreateClientRequest, UpdateClientRequest } from '@trener/shared';
import { notFound } from '../../errors.js';

export type ClientsDeps = { newId: () => string };

function toResponse(r: ClientRow): ClientResponse {
  return {
    id: r.id,
    firstName: r.firstName,
    lastName: r.lastName,
    phone: r.phone,
    notes: r.notes,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  };
}

export function makeClientsService(repo: ClientsRepo, deps: ClientsDeps) {
  return {
    async create(trainerId: string, input: CreateClientRequest): Promise<ClientResponse> {
      const row = await repo.create({
        clientId: deps.newId(),
        trainerId,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone ?? null,
        notes: input.notes ?? null,
      });
      return toResponse(row);
    },

    async list(trainerId: string): Promise<ClientResponse[]> {
      const rows = await repo.listByTrainer(trainerId);
      return rows.map(toResponse);
    },

    async get(trainerId: string, clientId: string): Promise<ClientResponse> {
      const row = await repo.getForTrainer(trainerId, clientId);
      if (!row) throw notFound('Клиент не найден');
      return toResponse(row);
    },

    async update(
      trainerId: string,
      clientId: string,
      patch: UpdateClientRequest,
    ): Promise<ClientResponse> {
      const row = await repo.update(trainerId, clientId, {
        firstName: patch.firstName,
        lastName: patch.lastName,
        phone: patch.phone ?? undefined,
        notes: patch.notes ?? undefined,
        status: patch.status,
      });
      if (!row) throw notFound('Клиент не найден');
      return toResponse(row);
    },

    async unlink(trainerId: string, clientId: string): Promise<void> {
      const ok = await repo.unlink(trainerId, clientId);
      if (!ok) throw notFound('Клиент не найден');
    },
  };
}

export type ClientsService = ReturnType<typeof makeClientsService>;
```

> Примечание по `phone`/`notes`: в `UpdateClientRequest` они `nullish` (могут быть `null` для очистки или отсутствовать). `patch.phone ?? undefined` превращает «отсутствует» в «не трогать»; явный `null` тоже станет `undefined` — то есть очистка через null в этой фазе не поддерживается (YAGNI). Если потребуется очистка — добавить различение позже.

- [ ] **Step 4: PASS. `npm run check` → exit 0. Commit**

Run: `npx vitest run apps/api/src/modules/clients/clients.service.test.ts` → PASS.

```
feat(api): clients.service (create/list/get/update/unlink, 404)
```

---

### Task 6: `clients.routes.ts` + `registerClientsModule` + wiring + integration

**Files:**

- Create: `apps/api/src/modules/clients/clients.routes.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/modules/clients/clients.routes.itest.ts`

- [ ] **Step 1: Роуты + регистрация модуля (`clients.routes.ts`)**

```ts
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createClientRequestSchema,
  updateClientRequestSchema,
  clientResponseSchema,
  clientListResponseSchema,
} from '@trener/shared';
import { randomUUID } from 'node:crypto';
import type { Db } from '../../db/client.js';
import { makeClientsRepo } from './clients.repo.js';
import { makeClientsService } from './clients.service.js';
import { requireAuth } from '../../plugins/tenant-context.js';
import { makeRequireClientAccess } from '../../plugins/require-client-access.js';
import { unauthorized } from '../../errors.js';

const idParams = z.object({ id: z.string() });
const clientWrap = z.object({ client: clientResponseSchema });

// Регистрация доменного модуля clients в composition root.
export function registerClientsModule(app: FastifyInstance, deps: { db: Db }): void {
  const repo = makeClientsRepo(deps.db);
  const svc = makeClientsService(repo, { newId: () => randomUUID() });
  const requireClientAccess = makeRequireClientAccess(repo);
  const typed = app.withTypeProvider<ZodTypeProvider>();

  function trainerId(req: { trainerId?: string }): string {
    if (!req.trainerId) throw unauthorized('Требуется вход');
    return req.trainerId;
  }

  typed.post(
    '/api/clients',
    {
      preHandler: requireAuth,
      schema: { body: createClientRequestSchema, response: { 201: clientWrap } },
    },
    async (req, reply) => {
      const client = await svc.create(trainerId(req), req.body);
      void reply.status(201);
      return { client };
    },
  );

  typed.get(
    '/api/clients',
    { preHandler: requireAuth, schema: { response: { 200: clientListResponseSchema } } },
    async (req) => ({ clients: await svc.list(trainerId(req)) }),
  );

  typed.get(
    '/api/clients/:id',
    {
      preHandler: [requireAuth, requireClientAccess],
      schema: { params: idParams, response: { 200: clientWrap } },
    },
    async (req) => ({ client: await svc.get(trainerId(req), req.params.id) }),
  );

  typed.patch(
    '/api/clients/:id',
    {
      preHandler: [requireAuth, requireClientAccess],
      schema: { params: idParams, body: updateClientRequestSchema, response: { 200: clientWrap } },
    },
    async (req) => ({ client: await svc.update(trainerId(req), req.params.id, req.body) }),
  );

  typed.delete(
    '/api/clients/:id',
    {
      preHandler: [requireAuth, requireClientAccess],
      schema: { params: idParams, response: { 200: z.object({ ok: z.literal(true) }) } },
    },
    async (req) => {
      await svc.unlink(trainerId(req), req.params.id);
      return { ok: true as const };
    },
  );
}
```

> Порядок preHandler важен: `requireAuth` (есть trainerId) → `requireClientAccess` (тренер связан с этим клиентом). Оба до хендлера.

- [ ] **Step 2: Подключить модуль в `buildApp` (`apps/api/src/app.ts`)**

Добавить импорт и вызов (после регистрации auth-scope, до/после health — не важно; clients-роуты сами навешивают `requireAuth`):

```ts
import { registerClientsModule } from './modules/clients/clients.routes.js';
```

и в теле `buildApp`, после auth-scope:

```ts
registerClientsModule(app, { db: deps.db });
```

- [ ] **Step 3: Падающий интеграционный тест (`clients.routes.itest.ts`)**

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { buildApp } from '../../app.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('clients routes (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;
  let sid: string;

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM sessions_auth`);
    await db.execute(sql`DELETE FROM trainers`);
    app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false });
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'a@b.co', password: 'longenough1', firstName: 'Тр', lastName: 'Ен' },
    });
    sid = reg.cookies.find((c) => c.name === 'sid')!.value;
  });
  afterAll(async () => {
    await pg.end();
  });

  it('CRUD: create → list → get → patch(archive) → delete', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/clients',
      cookies: { sid },
      payload: { firstName: 'Алина', lastName: 'Кузнецова', phone: '+7900', notes: 'новичок' },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json<{ client: { id: string } }>().client.id;

    const list = await app.inject({ method: 'GET', url: '/api/clients', cookies: { sid } });
    expect(list.json<{ clients: unknown[] }>().clients).toHaveLength(1);

    const got = await app.inject({ method: 'GET', url: `/api/clients/${id}`, cookies: { sid } });
    expect(got.statusCode).toBe(200);
    expect(got.json<{ client: { firstName: string } }>().client.firstName).toBe('Алина');

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/clients/${id}`,
      cookies: { sid },
      payload: { status: 'archived', notes: 'пауза' },
    });
    expect(patched.json<{ client: { status: string } }>().client.status).toBe('archived');

    const del = await app.inject({ method: 'DELETE', url: `/api/clients/${id}`, cookies: { sid } });
    expect(del.statusCode).toBe(200);

    const after = await app.inject({ method: 'GET', url: `/api/clients/${id}`, cookies: { sid } });
    expect(after.statusCode).toBe(404); // связь разорвана
  });

  it('создание без auth → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/clients',
      payload: { firstName: 'X', lastName: 'Y' },
    });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 4: Прогнать против Docker-Postgres**

Run (PowerShell):

```
docker run --rm -d --name trener-pg-p3 -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=trener_test -p 5435:5432 postgres:16
$env:DATABASE_URL='postgres://postgres:pg@localhost:5435/trener_test'
npm --prefix apps/api run db:migrate
npx vitest run apps/api/src/modules/clients/clients.routes.itest.ts
```

Expected: PASS (2). Затем `docker stop trener-pg-p3`.

- [ ] **Step 5: `npm run check` → exit 0. Commit**

```
feat(api): clients-роуты (CRUD) + registerClientsModule
```

---

### Task 7: Security/isolation тесты (эталон изоляции)

**Files:**

- Test: `apps/api/src/modules/clients/clients.isolation.itest.ts`

- [ ] **Step 1: Тест (`clients.isolation.itest.ts`)** — тренер B не видит/не меняет/не удаляет клиента тренера A:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { buildApp } from '../../app.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('clients isolation (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;

  async function registerTrainer(email: string): Promise<string> {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email, password: 'longenough1', firstName: 'T', lastName: 'R' },
    });
    return reg.cookies.find((c) => c.name === 'sid')!.value;
  }

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM sessions_auth`);
    await db.execute(sql`DELETE FROM trainers`);
    app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false });
  });
  afterAll(async () => {
    await pg.end();
  });

  it('тренер B не видит/не меняет/не удаляет клиента тренера A (404)', async () => {
    const sidA = await registerTrainer('a@b.co');
    const sidB = await registerTrainer('b@b.co');

    const created = await app.inject({
      method: 'POST',
      url: '/api/clients',
      cookies: { sid: sidA },
      payload: { firstName: 'Алина', lastName: 'К' },
    });
    const id = created.json<{ client: { id: string } }>().client.id;

    // B не видит A-клиента в своём списке
    const listB = await app.inject({ method: 'GET', url: '/api/clients', cookies: { sid: sidB } });
    expect(listB.json<{ clients: unknown[] }>().clients).toHaveLength(0);

    // B получает 404 на чтение/патч/удаление чужого клиента
    expect(
      (await app.inject({ method: 'GET', url: `/api/clients/${id}`, cookies: { sid: sidB } }))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/clients/${id}`,
          cookies: { sid: sidB },
          payload: { notes: 'hack' },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/clients/${id}`, cookies: { sid: sidB } }))
        .statusCode,
    ).toBe(404);

    // A по-прежнему видит своего клиента (B ничего не сломал)
    expect(
      (await app.inject({ method: 'GET', url: `/api/clients/${id}`, cookies: { sid: sidA } }))
        .statusCode,
    ).toBe(200);
  });
});
```

- [ ] **Step 2: Прогнать против Docker-Postgres** (как Task 6 Step 4, файл `clients.isolation.itest.ts`). Expected: PASS (1). Остановить контейнер.

- [ ] **Step 3: `npm run check` → exit 0. Commit**

```
test(api): isolation-тесты clients (тренер A ≠ тренер B → 404)
```

---

## Definition of Done (Фаза 3)

- `npm run check` зелёный; все `*.itest.ts` проходят против Docker-Postgres.
- Тренер создаёт/листит/читает/обновляет клиентов; «удаление» = разрыв связи; архив = `status='archived'`.
- Связь тренер↔клиент M:N (`clients` + `trainer_clients`), миграция `0002`.
- **Изоляция доказана**: тренер B не видит/не меняет/не удаляет клиента тренера A (404); без auth → 401. Repo фильтрует по `trainerId`.
- `requireClientAccess` guard работает (seam для вложенных ресурсов Фазы 4); `registerClientsModule` — паттерн подключения доменного модуля.
- Все роуты валидируются Zod-схемами из `@trener/shared`.

## Перенос в Фазу 4 (фиксируется здесь)

- Доменные модули `exercises`, `workout-templates`, `client-workouts`, `sessions` — по тому же паттерну (repo scoped по trainerId; вложенные ресурсы под клиентом используют `requireClientAccess`).
- Расширение полей клиента (дата рождения, рост, доп. контакты) — по мере надобности.
- Очистка осиротевших `clients` (персона без связей) — фоновая задача/политика, если потребуется.
- Поддержка очистки `phone`/`notes` через явный `null` (сейчас YAGNI — null трактуется как «не трогать»).
