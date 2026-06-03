# Календарь клиентского приложения — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Клиент видит свои занятия в той же сетке день/неделя/месяц, что и тренер, и подтверждает/отклоняет будущие занятия через отдельный статус `clientConfirmation`; тренер видит ответ.

**Architecture:** Бэкенд: новое поле `sessions.clientConfirmation` (миграция), методы `listForClient`/`setClientConfirmation` в repo+service, новый фасад `client-app-calendar` по паттерну `makeClientScope`. Фронт: порт `SessionsCalendar` + date-хелперов в `apps/web-client` (создание убрано, лист подтверждения), новый экран и API-хуки. Тренерская сторона: индикатор ответа на блоках.

**Tech Stack:** Fastify 5 + Drizzle + Postgres 16; React 18 + Vite + Tailwind v4 + TanStack Query 5; Zod-контракты в `@trener/shared`.

**Спека:** `docs/superpowers/specs/2026-06-03-web-client-calendar-design.md`.

---

## Соглашения по тестам

- Unit-тесты сервисов гоняются всегда (`npm run check`).
- `*.itest.ts` исполняются **только** против `trener_test` (их `beforeAll` стирает таблицы).
  Запуск: `DATABASE_URL=postgres://...@localhost:5432/trener_test npx vitest run <file>` —
  **запускает контроллер, не сабагент** (сабагент не трогает docker/БД/миграции).
- Сабагент пишет код и гоняет unit-тесты (`npm run test -- <file>`) + `npm run check`.

---

## File Structure

- **Изменяю:** `apps/api/src/db/schema.ts` (колонка `clientConfirmation` + check-constraint).
- **Создаю:** `apps/api/drizzle/0027_*.sql` (генерируется drizzle-kit — делает контроллер).
- **Изменяю:** `packages/shared/src/sessions.ts` (контракт).
- **Изменяю:** `apps/api/src/modules/sessions/sessions.repo.ts` (cols/toResponse/SessionRow + 2 метода).
- **Изменяю:** `apps/api/src/modules/sessions/sessions.service.ts` (2 метода).
- **Изменяю:** `apps/api/src/modules/sessions/sessions.service.test.ts` (фикстуры + новые тесты).
- **Создаю:** `apps/api/src/modules/client-app-calendar/client-app-calendar.routes.ts`.
- **Создаю:** `apps/api/src/modules/client-app-calendar/client-app-calendar.module.ts`.
- **Создаю:** `apps/api/src/modules/client-app-calendar/client-app-calendar.isolation.itest.ts`.
- **Изменяю:** `apps/api/src/app.ts` (регистрация фасада).
- **Создаю:** `apps/web-client/src/lib/calendar.ts` (порт date-хелперов).
- **Создаю:** `apps/web-client/src/components/SessionsCalendar.tsx` (порт, клиентская адаптация).
- **Создаю:** `apps/web-client/src/api/calendar.ts` (хуки).
- **Создаю:** `apps/web-client/src/pages/CalendarPage.tsx` (экран).
- **Изменяю:** `apps/web-client/src/App.tsx` (маршрут вместо заглушки).
- **Изменяю:** `apps/web/src/components/SessionsCalendar.tsx` (индикатор ответа клиента на блоках).

---

## Task 1: Контракт `clientConfirmation` в @trener/shared

**Files:**

- Modify: `packages/shared/src/sessions.ts`

- [ ] **Step 1: Добавить схему статуса и запрос подтверждения, расширить ответ**

В `packages/shared/src/sessions.ts` после `sessionStatusSchema` добавить:

```ts
export const clientConfirmationSchema = z.enum(['pending', 'confirmed', 'declined']);
export type ClientConfirmation = z.infer<typeof clientConfirmationSchema>;
```

В `sessionResponseSchema` добавить поле (после `note`):

```ts
  note: z.string().nullable(),
  clientConfirmation: clientConfirmationSchema,
```

В конец секции «Создание/обновление» (после `updateSessionRequestSchema`) добавить запрос клиента:

```ts
// --- Подтверждение/отклонение занятия клиентом ---
export const clientSessionConfirmRequestSchema = z.object({
  status: z.enum(['confirmed', 'declined']),
});
export type ClientSessionConfirmRequest = z.infer<typeof clientSessionConfirmRequestSchema>;
```

- [ ] **Step 2: Проверить экспорт из barrel**

Убедиться, что `packages/shared/src/index.ts` реэкспортирует `./sessions` (он уже это делает —
`sessionResponseSchema` экспортируется). Новые имена попадут автоматически. Если в barrel
перечислены имена поимённо — добавить `clientConfirmationSchema`, `ClientConfirmation`,
`clientSessionConfirmRequestSchema`, `ClientSessionConfirmRequest`.

Run: `npm run build -w @trener/shared`
Expected: сборка без ошибок типов.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/sessions.ts packages/shared/src/index.ts
git commit -m "feat(shared): контракт clientConfirmation для занятий"
```

---

## Task 2: Схема БД — колонка `clientConfirmation`

**Files:**

- Modify: `apps/api/src/db/schema.ts:269-276`

- [ ] **Step 1: Добавить колонку и check-constraint в таблицу `sessions`**

В `apps/api/src/db/schema.ts` в объект колонок `sessions` после `note` добавить:

```ts
    note: text('note'),
    clientConfirmation: text('client_confirmation')
      .$type<'pending' | 'confirmed' | 'declined'>()
      .notNull()
      .default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
```

В массив ограничений таблицы (третий аргумент `pgTable`) добавить check:

```ts
  (t) => [
    index('idx_sessions_trainer_date').on(t.trainerId, t.date),
    check('sessions_status_chk', sql`${t.status} IN ('planned', 'completed', 'cancelled')`),
    check(
      'sessions_client_confirmation_chk',
      sql`${t.clientConfirmation} IN ('pending', 'confirmed', 'declined')`,
    ),
  ],
```

- [ ] **Step 2: Сгенерировать миграцию (делает контроллер)**

> ⚠️ Сабагент НЕ запускает drizzle-kit/миграции. Сабагент только редактирует `schema.ts`
> и сообщает статус DONE. Генерацию миграции `0027` (`npm run db:generate -w @trener/api`
> или эквивалент) и её применение к `trener`/`trener_test` выполняет контроллер.

Run (контроллер): `npm run db:generate -w apps/api`
Expected: создан `apps/api/drizzle/0027_*.sql` c `ALTER TABLE "sessions" ADD COLUMN "client_confirmation" text DEFAULT 'pending' NOT NULL;` и `ALTER TABLE ... ADD CONSTRAINT "sessions_client_confirmation_chk" ...`.

- [ ] **Step 3: Commit (после генерации миграции)**

```bash
git add apps/api/src/db/schema.ts apps/api/drizzle/
git commit -m "feat(db): колонка sessions.client_confirmation (миграция 0027)"
```

---

## Task 3: Repo — `clientConfirmation` в маппинге + `listForClient` + `setClientConfirmation`

**Files:**

- Modify: `apps/api/src/modules/sessions/sessions.repo.ts`

- [ ] **Step 1: Расширить `SessionRow`, `cols`, `toResponse`**

В типе `SessionRow` добавить поле (после `note`):

```ts
note: string | null;
clientConfirmation: 'pending' | 'confirmed' | 'declined';
createdAt: Date;
```

В объект `cols` добавить:

```ts
  note: sessions.note,
  clientConfirmation: sessions.clientConfirmation,
  createdAt: sessions.createdAt,
```

В `toResponse` добавить поле в возвращаемый объект (после `note`):

```ts
    note: r.note,
    clientConfirmation: r.clientConfirmation,
  };
```

- [ ] **Step 2: Добавить методы `listForClient` и `setClientConfirmation` в возвращаемый объект repo**

Импорт уже содержит `and, asc, eq, gte, lte`. После метода `listByTrainer` добавить:

```ts
    // Занятия конкретного клиента у тренера, опц. фильтр по диапазону дат.
    // Онлайн НЕ скрывается — клиент посещает онлайн-занятия.
    async listForClient(
      trainerId: string,
      clientId: string,
      range: ListRange = {},
    ): Promise<SessionRow[]> {
      const conds = [eq(sessions.trainerId, trainerId), eq(sessions.clientId, clientId)];
      if (range.from !== undefined) conds.push(gte(sessions.date, range.from));
      if (range.to !== undefined) conds.push(lte(sessions.date, range.to));
      return db
        .select(cols)
        .from(sessions)
        .where(and(...conds))
        .orderBy(asc(sessions.date), asc(sessions.startTime));
    },

    // Подтверждение/отклонение клиентом своего занятия. Скоуп по trainerId+clientId,
    // чтобы клиент не мог тронуть чужое. null — не найдено/не принадлежит клиенту.
    async setClientConfirmation(
      trainerId: string,
      clientId: string,
      id: string,
      status: 'confirmed' | 'declined',
    ): Promise<SessionRow | null> {
      const [row] = await db
        .update(sessions)
        .set({ clientConfirmation: status })
        .where(
          and(
            eq(sessions.id, id),
            eq(sessions.trainerId, trainerId),
            eq(sessions.clientId, clientId),
          ),
        )
        .returning(cols);
      return row ?? null;
    },
```

- [ ] **Step 3: Прогнать типы**

Run: `npm run typecheck -w apps/api`
Expected: без ошибок (PASS).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/sessions/sessions.repo.ts
git commit -m "feat(sessions): listForClient + setClientConfirmation в repo"
```

---

## Task 4: Service — `listForClient` + `setClientConfirmation` (TDD)

**Files:**

- Modify: `apps/api/src/modules/sessions/sessions.service.ts`
- Test: `apps/api/src/modules/sessions/sessions.service.test.ts`

- [ ] **Step 1: Обновить фикстуры теста (новое поле + новые методы repo)**

В `sessions.service.test.ts` в хелпер `row()` добавить поле (после `note: null`):

```ts
    note: null,
    clientConfirmation: 'pending',
    createdAt: new Date(0),
```

В `fakeRepo()` добавить два метода в объект (рядом с остальными):

```ts
    listForClient: vi.fn(() => Promise.resolve([])),
    setClientConfirmation: vi.fn(() => Promise.resolve(null)),
```

- [ ] **Step 2: Написать падающие тесты для новых методов сервиса**

Добавить в `describe`:

```ts
it('listForClient прокидывает trainerId, clientId и диапазон', async () => {
  const listForClient = vi.fn(() => Promise.resolve([row({ id: 's1' }), row({ id: 's2' })]));
  const svc = makeSessionsService(fakeRepo({ listForClient }), { newId: () => 'x' });
  const res = await svc.listForClient('A', 'c1', { from: '2026-06-01', to: '2026-06-30' });
  expect(res.map((s) => s.id)).toEqual(['s1', 's2']);
  expect(listForClient).toHaveBeenCalledWith('A', 'c1', { from: '2026-06-01', to: '2026-06-30' });
});

it('setClientConfirmation резолвит обновлённое занятие', async () => {
  const setClientConfirmation = vi.fn(() =>
    Promise.resolve(row({ clientConfirmation: 'confirmed' })),
  );
  const svc = makeSessionsService(fakeRepo({ setClientConfirmation }), { newId: () => 'x' });
  const res = await svc.setClientConfirmation('A', 'c1', 's1', 'confirmed');
  expect(res.clientConfirmation).toBe('confirmed');
  expect(setClientConfirmation).toHaveBeenCalledWith('A', 'c1', 's1', 'confirmed');
});

it('setClientConfirmation → notFound, если repo вернул null', async () => {
  const setClientConfirmation = vi.fn(() => Promise.resolve(null));
  const svc = makeSessionsService(fakeRepo({ setClientConfirmation }), { newId: () => 'x' });
  await expect(svc.setClientConfirmation('A', 'c1', 'nope', 'declined')).rejects.toMatchObject({
    status: 404,
  });
});
```

- [ ] **Step 3: Запустить — убедиться, что падают**

Run: `npm run test -w apps/api -- sessions.service`
Expected: FAIL (методов `listForClient`/`setClientConfirmation` нет в сервисе).

- [ ] **Step 4: Реализовать методы в сервисе**

В `sessions.service.ts` импортировать тип статуса и добавить методы. В возвращаемый объект
(после `list`) добавить:

```ts
    async listForClient(
      trainerId: string,
      clientId: string,
      range: ListRange = {},
    ): Promise<SessionResponse[]> {
      const rows = await repo.listForClient(trainerId, clientId, range);
      return rows.map(toResponse);
    },

    async setClientConfirmation(
      trainerId: string,
      clientId: string,
      id: string,
      status: 'confirmed' | 'declined',
    ): Promise<SessionResponse> {
      const row = await repo.setClientConfirmation(trainerId, clientId, id, status);
      if (!row) throw notFound('Занятие не найдено');
      return toResponse(row);
    },
```

- [ ] **Step 5: Запустить — убедиться, что проходят**

Run: `npm run test -w apps/api -- sessions.service`
Expected: PASS (включая прежние тесты).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/sessions/sessions.service.ts apps/api/src/modules/sessions/sessions.service.test.ts
git commit -m "feat(sessions): listForClient + setClientConfirmation в service"
```

---

## Task 5: Фасад `client-app-calendar` (роуты + модуль + регистрация + isolation itest)

**Files:**

- Create: `apps/api/src/modules/client-app-calendar/client-app-calendar.routes.ts`
- Create: `apps/api/src/modules/client-app-calendar/client-app-calendar.module.ts`
- Create: `apps/api/src/modules/client-app-calendar/client-app-calendar.isolation.itest.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Роуты фасада**

Создать `client-app-calendar.routes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  sessionListResponseSchema,
  sessionResponseSchema,
  clientSessionConfirmRequestSchema,
} from '@trener/shared';
import type { SessionsService } from '../sessions/sessions.service.js';
import { requireClient } from '../../plugins/client-context.js';
import { makeClientScope, type ResolveScope } from '../../core/client-scope.js';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const listQuery = z.object({ from: dateStr.optional(), to: dateStr.optional() });
const idParams = z.object({ id: z.string().min(1) });
const sessionWrap = z.object({ session: sessionResponseSchema });

export function clientAppCalendarRoutes(
  app: FastifyInstance,
  svc: SessionsService,
  resolveScope: ResolveScope,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const scope = makeClientScope(resolveScope);

  typed.get(
    '/api/client/sessions',
    {
      preHandler: requireClient,
      schema: { querystring: listQuery, response: { 200: sessionListResponseSchema } },
    },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      const range: { from?: string; to?: string } = {};
      if (req.query.from !== undefined) range.from = req.query.from;
      if (req.query.to !== undefined) range.to = req.query.to;
      return { sessions: await svc.listForClient(trainerId, clientId, range) };
    },
  );

  typed.post(
    '/api/client/sessions/:id/confirmation',
    {
      preHandler: requireClient,
      schema: {
        params: idParams,
        body: clientSessionConfirmRequestSchema,
        response: { 200: sessionWrap },
      },
    },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      const session = await svc.setClientConfirmation(
        trainerId,
        clientId,
        req.params.id,
        req.body.status,
      );
      return { session };
    },
  );
}
```

- [ ] **Step 2: Модуль фасада**

Создать `client-app-calendar.module.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import type { ClientLink } from '@trener/shared';
import { makeSessionsRepo } from '../sessions/sessions.repo.js';
import { makeSessionsService } from '../sessions/sessions.service.js';
import { clientAppCalendarRoutes } from './client-app-calendar.routes.js';

export function registerClientAppCalendarModule(
  app: FastifyInstance,
  deps: { db: Db; clock: Clock; resolveScope: (id: string) => Promise<ClientLink> },
): void {
  const svc = makeSessionsService(makeSessionsRepo(deps.db), { newId: deps.clock.newId });
  clientAppCalendarRoutes(app, svc, deps.resolveScope);
}
```

- [ ] **Step 3: Зарегистрировать в `app.ts`**

В `apps/api/src/app.ts` добавить импорт рядом с другими `client-app-*` (после строки 21):

```ts
import { registerClientAppCalendarModule } from './modules/client-app-calendar/client-app-calendar.module.js';
```

И регистрацию после `registerClientAppTrainerModule(...)` (после строки 86):

```ts
registerClientAppCalendarModule(app, {
  db: deps.db,
  clock,
  resolveScope: (id) => clientAuthSvc.resolveScope(id),
});
```

- [ ] **Step 4: Прогнать типы**

Run: `npm run typecheck -w apps/api`
Expected: PASS.

- [ ] **Step 5: Isolation itest (исполняет контроллер против trener_test)**

Создать `client-app-calendar.isolation.itest.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { buildApp } from '../../app.js';
import { createDb } from '../../db/client.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('client-app-calendar (isolation)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    await db.execute(sql`DELETE FROM sessions`);
    await db.execute(sql`DELETE FROM client_sessions_auth`);
    await db.execute(sql`DELETE FROM client_accounts`);
    await db.execute(sql`DELETE FROM sessions_auth`);
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM trainers`);
    app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await pg.end();
  });

  function clientSid(res: Awaited<ReturnType<typeof app.inject>>): string {
    const c = res.cookies.find((ck) => ck.name === 'client_sid');
    if (!c) throw new Error('нет client_sid');
    return c.value;
  }
  function trainerSid(res: Awaited<ReturnType<typeof app.inject>>): string {
    const c = res.cookies.find((ck) => ck.name === 'sid');
    if (!c) throw new Error('нет sid');
    return c.value;
  }

  it('без client_sid → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/client/sessions' });
    expect(res.statusCode).toBe(401);
  });

  it('непривязанный клиент → 409 NOT_LINKED', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'cal-unl@b.co', password: 'longenough1', firstName: 'К', lastName: 'Л' },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/client/sessions',
      cookies: { client_sid: clientSid(reg) },
    });
    expect(res.statusCode).toBe(409);
  });

  it('клиент видит только свои занятия и подтверждает их', async () => {
    // Клиент A
    const regA = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'cal-a@b.co', password: 'longenough1', firstName: 'А', lastName: 'А' },
    });
    const accA = regA.json<{ account: { id: string } }>().account.id;
    const sidA = clientSid(regA);

    // Тренер
    const regT = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'cal-t@b.co', password: 'longenough1', firstName: 'Т', lastName: 'Р' },
    });
    const tSid = trainerSid(regT);

    // Два клиента у тренера: clientA привязан к аккаунту A, clientB — чужой.
    const cliA = await app.inject({
      method: 'POST',
      url: '/api/clients',
      cookies: { sid: tSid },
      payload: { firstName: 'Кли', lastName: 'А', accountId: accA },
    });
    const clientAId = cliA.json<{ client: { id: string } }>().client.id;
    const cliB = await app.inject({
      method: 'POST',
      url: '/api/clients',
      cookies: { sid: tSid },
      payload: { firstName: 'Кли', lastName: 'Б' },
    });
    const clientBId = cliB.json<{ client: { id: string } }>().client.id;

    // Занятие клиенту A (онлайн — должно быть видно клиенту) и клиенту B.
    const sesA = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      cookies: { sid: tSid },
      payload: { clientId: clientAId, date: '2026-06-10', startTime: '10:00', isOnline: true },
    });
    const sessionAId = sesA.json<{ session: { id: string } }>().session.id;
    await app.inject({
      method: 'POST',
      url: '/api/sessions',
      cookies: { sid: tSid },
      payload: { clientId: clientBId, date: '2026-06-11', startTime: '11:00' },
    });

    // Клиент A видит только своё занятие (онлайн включительно), статус pending.
    const list = await app.inject({
      method: 'GET',
      url: '/api/client/sessions?from=2026-06-01&to=2026-06-30',
      cookies: { client_sid: sidA },
    });
    expect(list.statusCode).toBe(200);
    const sessions = list.json<{ sessions: { id: string; clientConfirmation: string }[] }>()
      .sessions;
    expect(sessions.map((s) => s.id)).toEqual([sessionAId]);
    expect(sessions[0]?.clientConfirmation).toBe('pending');

    // Подтверждение своего занятия.
    const conf = await app.inject({
      method: 'POST',
      url: `/api/client/sessions/${sessionAId}/confirmation`,
      cookies: { client_sid: sidA },
      payload: { status: 'confirmed' },
    });
    expect(conf.statusCode).toBe(200);
    expect(
      conf.json<{ session: { clientConfirmation: string } }>().session.clientConfirmation,
    ).toBe('confirmed');

    // Чужое занятие подтвердить нельзя → 404.
    const sesBId = (
      await app.inject({
        method: 'GET',
        url: '/api/sessions?from=2026-06-01&to=2026-06-30',
        cookies: { sid: tSid },
      })
    )
      .json<{ sessions: { id: string; clientId: string }[] }>()
      .sessions.find((s) => s.clientId === clientBId)?.id;
    const forbidden = await app.inject({
      method: 'POST',
      url: `/api/client/sessions/${sesBId}/confirmation`,
      cookies: { client_sid: sidA },
      payload: { status: 'declined' },
    });
    expect(forbidden.statusCode).toBe(404);
  });
});
```

- [ ] **Step 6: Прогон itest (контроллер)**

Run (контроллер): `DATABASE_URL=postgres://postgres:postgres@localhost:5432/trener_test npx vitest run apps/api/src/modules/client-app-calendar/client-app-calendar.isolation.itest.ts`
Expected: 3 passed. (Точная строка подключения — из docker-окружения контроллера.)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/client-app-calendar/ apps/api/src/app.ts
git commit -m "feat(api): фасад client-app-calendar (список занятий + подтверждение)"
```

---

## Task 6: Фронт — порт date-хелперов

**Files:**

- Create: `apps/web-client/src/lib/calendar.ts`

- [ ] **Step 1: Скопировать `apps/web/src/lib/calendar.ts` в `apps/web-client/src/lib/calendar.ts`**

Содержимое **идентично** тренерскому файлу (чистые утилиты, без зависимостей). Полный текст —
файл `apps/web/src/lib/calendar.ts` (экспортирует `DAY_SHORT`, `DAY_FULL`, `MONTH_FULL`,
`MONTH_GEN`, `CAL_START_HOUR`, `CAL_HOURS`, `toISODate`, `parseISO`, `addDays`, `addMonths`,
`weekdayMon`, `startOfWeek`, `weekDates`, `monthGrid`, `sameDay`, `timeToMin`, `endTime`,
`humanDuration`). Скопировать без изменений.

- [ ] **Step 2: Проверить типы web-client**

Run: `npm run typecheck -w apps/web-client`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web-client/src/lib/calendar.ts
git commit -m "chore(web-client): порт date-хелперов календаря"
```

---

## Task 7: Фронт — порт `SessionsCalendar` (клиентская адаптация)

**Files:**

- Create: `apps/web-client/src/components/SessionsCalendar.tsx`

- [ ] **Step 1: Скопировать тренерский `SessionsCalendar.tsx` с правками под клиента**

Взять полный текст `apps/web/src/components/SessionsCalendar.tsx` и внести **только** эти правки:

1. Импорт пути хелперов остаётся `'../lib/calendar'` (в web-client путь тот же).
2. Сделать `onSlotClick` опциональным в `SessionsCalendarProps`:

```ts
  /** Тап по пустому слоту (создание). У клиента не используется. */
  onSlotClick?: (date: Date, hour: number) => void;
```

3. В сигнатуре `SessionsCalendar({...})` обработать отсутствие `onSlotClick` — слоты
   некликабельны у клиента. Передавать в `WeekView`/`DayView` флаг `slotsEnabled = !!onSlotClick`
   и no-op, если проп не задан:

В `WeekView`:

```tsx
{
  view === 'week' && (
    <WeekView
      anchor={anchor}
      sessions={sessions}
      onPick={onSessionClick}
      onPickDay={pickDay}
      onSlot={onSlotClick ?? (() => {})}
      slotsEnabled={onSlotClick !== undefined}
      renderLabel={renderLabel}
    />
  );
}
```

В `DayView`:

```tsx
{
  view === 'day' && (
    <DayView
      date={anchor}
      sessions={sessions}
      onPick={onSessionClick}
      onSlot={(hour) => onSlotClick?.(anchor, hour)}
      slotsEnabled={onSlotClick !== undefined}
      renderLabel={renderLabel}
    />
  );
}
```

4. В `DayView`/`WeekView` добавить проп `slotsEnabled: boolean` и рендерить кнопки-слоты
   только при `slotsEnabled` (иначе сетка читается как фон без действия). Заменить блок
   `{hours.map((h, i) => (<button … onClick={() => onSlot(...)} …/>))}` на:

```tsx
                  {slotsEnabled &&
                    hours.map((h, i) => (
                      /* существующая кнопка-слот без изменений */
                    ))}
```

(для `DayView` — аналогично, обернуть map слотов в `{slotsEnabled && …}`).

5. **Индикатор подтверждения клиента на блоке.** В `DayView` в блок занятия (внутри `<button>`,
   рядом с `Wifi`) добавить иконку статуса. Импортировать из `lucide-react`:
   `Check, X` уже понадобятся — добавить к импорту: `import { Check, ChevronLeft, ChevronRight, Wifi, X } from 'lucide-react';`
   Добавить хелпер рядом с `tileClasses`:

```tsx
function ConfirmMark({ value }: { value: SessionResponse['clientConfirmation'] }) {
  if (value === 'confirmed') return <Check size={12} strokeWidth={2.4} className="shrink-0" />;
  if (value === 'declined')
    return <X size={12} strokeWidth={2.4} className="shrink-0 opacity-70" />;
  return null;
}
```

В `DayView`-блоке в строку с `Wifi`/меткой добавить `<ConfirmMark value={s.clientConfirmation} />`
после метки. В `WeekView`-блоке (компактный) — добавить `<ConfirmMark .../>` рядом с `Wifi`/меткой,
когда высота позволяет (внутри существующего `<button>`).

6. Поменять JSDoc-комментарий компонента: убрать упоминание тренера, добавить «клиент
   подтверждает занятия; создание занятий не поддерживается».

- [ ] **Step 2: Проверить типы и линт**

Run: `npm run typecheck -w apps/web-client && npm run lint -w apps/web-client`
Expected: PASS (нет `any`, нет неиспользуемых импортов).

- [ ] **Step 3: Commit**

```bash
git add apps/web-client/src/components/SessionsCalendar.tsx
git commit -m "feat(web-client): порт сетки SessionsCalendar (клиентская версия)"
```

---

## Task 8: Фронт — API-хуки календаря клиента

**Files:**

- Create: `apps/web-client/src/api/calendar.ts`

- [ ] **Step 1: Хуки списка занятий и подтверждения**

Создать `apps/web-client/src/api/calendar.ts`:

```ts
import {
  sessionListResponseSchema,
  sessionResponseSchema,
  type SessionResponse,
} from '@trener/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, ApiError } from './client';

const sessionWrap = z.object({ session: sessionResponseSchema });

/** Интервал опроса календаря (мс). Вебсокетов нет — polling, как в чате. */
const SESSIONS_REFETCH_MS = 8000;

export const clientSessionsQueryKey = (from?: string, to?: string) =>
  ['client', 'sessions', from ?? '', to ?? ''] as const;

/** Занятия клиента за диапазон. Непривязанный клиент (409) → пустой список, не ошибка. */
export function useClientSessions(from?: string, to?: string) {
  return useQuery<SessionResponse[]>({
    queryKey: clientSessionsQueryKey(from, to),
    queryFn: async () => {
      try {
        const qs = new URLSearchParams();
        if (from) qs.set('from', from);
        if (to) qs.set('to', to);
        const r = await apiFetch(`/client/sessions?${qs.toString()}`, {
          schema: sessionListResponseSchema,
        });
        return r.sessions;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) return [];
        throw err;
      }
    },
    refetchInterval: SESSIONS_REFETCH_MS,
  });
}

/** Подтверждение/отклонение занятия клиентом. Инвалидирует все диапазоны списка. */
export function useConfirmSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; status: 'confirmed' | 'declined' }) =>
      apiFetch(`/client/sessions/${input.id}/confirmation`, {
        method: 'POST',
        body: { status: input.status },
        schema: sessionWrap,
      }).then((r) => r.session),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['client', 'sessions'] });
    },
  });
}
```

- [ ] **Step 2: Сверить сигнатуру `apiFetch`**

Открыть `apps/web-client/src/api/client.ts` и убедиться, что `apiFetch(path, { method, body, schema })`
поддерживает `body` (как в `auth`/`chat` хуках). Если `body` сериализуется иначе — привести к
существующему стилю (см. `apps/web-client/src/api/chat.ts`: `useSendClientMessage`).

- [ ] **Step 3: Проверить типы**

Run: `npm run typecheck -w apps/web-client`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web-client/src/api/calendar.ts
git commit -m "feat(web-client): API-хуки календаря (список + подтверждение)"
```

---

## Task 9: Фронт — экран `CalendarPage` + маршрут

**Files:**

- Create: `apps/web-client/src/pages/CalendarPage.tsx`
- Modify: `apps/web-client/src/App.tsx`

- [ ] **Step 1: Экран календаря с листом подтверждения**

Создать `apps/web-client/src/pages/CalendarPage.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { Wifi, X } from 'lucide-react';
import type { SessionResponse } from '@trener/shared';
import { useClientMe } from '../api/auth';
import { useClientSessions, useConfirmSession } from '../api/calendar';
import { SessionsCalendar } from '../components/SessionsCalendar';
import { MONTH_GEN, endTime, humanDuration, monthGrid, parseISO, toISODate } from '../lib/calendar';

const CONFIRM_LABEL: Record<SessionResponse['clientConfirmation'], string> = {
  pending: 'Ожидает ответа',
  confirmed: 'Вы подтвердили',
  declined: 'Вы отклонили',
};

/** Занятие в прошлом: дата+время начала <= now. */
function isPast(s: SessionResponse): boolean {
  const d = parseISO(s.date);
  const [h, m] = s.startTime.split(':').map(Number);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.getTime() <= Date.now();
}

export function CalendarPage() {
  const me = useClientMe();
  const linked = me.data?.link != null;
  const [anchor, setAnchor] = useState<Date>(new Date());

  // Диапазон месяца-сетки текущего якоря (42 дня) — покрывает day/week/month.
  const { from, to } = useMemo(() => {
    const grid = monthGrid(anchor);
    const first = grid[0];
    const last = grid[grid.length - 1];
    return {
      from: first ? toISODate(first) : undefined,
      to: last ? toISODate(last) : undefined,
    };
  }, [anchor]);

  const sessions = useClientSessions(from, to);
  const list = sessions.data ?? [];

  const [selected, setSelected] = useState<SessionResponse | null>(null);

  return (
    <div className="flex h-full flex-col">
      <h1 className="px-4 pb-1 pt-5 font-[family-name:var(--font-display)] text-[24px] text-ink">
        Календарь
      </h1>

      {!linked ? (
        <p className="px-5 pt-6 text-sm text-ink-muted">
          Вы пока не подключены к тренеру. Подключите его, чтобы здесь появились назначенные
          занятия.
        </p>
      ) : sessions.isError ? (
        <p className="px-5 pt-4 text-sm text-ink-muted" role="alert">
          Не удалось загрузить занятия. Попробуйте обновить страницу.
        </p>
      ) : (
        <SessionsCalendar
          sessions={list}
          defaultView="week"
          anchor={anchor}
          onAnchorChange={setAnchor}
          onSessionClick={setSelected}
        />
      )}

      {selected && <SessionSheet session={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function SessionSheet({ session, onClose }: { session: SessionResponse; onClose: () => void }) {
  const confirm = useConfirmSession();
  const past = isPast(session);
  const d = parseISO(session.date);
  const dateLabel = `${String(d.getDate())} ${MONTH_GEN[d.getMonth()]}`;
  const timeLabel = `${session.startTime}–${endTime(session.startTime, session.durationMin)}`;

  function respond(status: 'confirmed' | 'declined') {
    confirm.mutate({ id: session.id, status }, { onSuccess: onClose });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div className="relative z-10 flex flex-col gap-4 rounded-t-3xl bg-bg px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
        <div className="flex items-start justify-between">
          <h2 className="text-[18px] font-bold text-ink">{session.title ?? 'Занятие'}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink active:bg-card-elevated"
          >
            <X size={20} strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex flex-col gap-1.5 text-[14px] text-ink">
          <span className="font-semibold">
            {dateLabel}, {timeLabel}
          </span>
          <span className="text-ink-muted">{humanDuration(session.durationMin)}</span>
          {session.isOnline ? (
            <span className="flex items-center gap-1.5 text-ink-muted">
              <Wifi size={14} strokeWidth={2} /> Онлайн-занятие
            </span>
          ) : (
            session.location && <span className="text-ink-muted">{session.location}</span>
          )}
          {session.note && <span className="text-ink-muted">{session.note}</span>}
        </div>

        <div className="rounded-2xl bg-card px-4 py-3 text-[13px] font-semibold text-ink-muted">
          {CONFIRM_LABEL[session.clientConfirmation]}
        </div>

        {!past && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={confirm.isPending}
              onClick={() => respond('confirmed')}
              className="flex-1 rounded-2xl bg-accent py-3.5 text-[15px] font-bold text-accent-on active:opacity-90 disabled:opacity-50"
            >
              Подтвердить
            </button>
            <button
              type="button"
              disabled={confirm.isPending}
              onClick={() => respond('declined')}
              className="flex-1 rounded-2xl bg-card py-3.5 text-[15px] font-semibold text-ink active:bg-card-elevated disabled:opacity-50"
            >
              Отклонить
            </button>
          </div>
        )}

        {confirm.isError && (
          <p className="text-sm text-ink-muted" role="alert">
            Не удалось сохранить. Попробуйте снова.
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Подключить маршрут вместо заглушки**

В `apps/web-client/src/App.tsx`:

- добавить импорт: `import { CalendarPage } from './pages/CalendarPage';`
- заменить строку
  `<Route path="/calendar" element={<StubPage title="Календарь" />} />`
  на `<Route path="/calendar" element={<CalendarPage />} />`.
- если `StubPage` больше нигде не используется — импорт оставить (его используют `/progress`),
  не удалять.

- [ ] **Step 3: Проверить типы, линт, тесты web-client**

Run: `npm run typecheck -w apps/web-client && npm run lint -w apps/web-client && npm run test -w apps/web-client`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web-client/src/pages/CalendarPage.tsx apps/web-client/src/App.tsx
git commit -m "feat(web-client): экран Календарь с подтверждением занятий"
```

---

## Task 10: Тренерская сторона — индикатор ответа клиента

**Files:**

- Modify: `apps/web/src/components/SessionsCalendar.tsx`

- [ ] **Step 1: Добавить маркер подтверждения на блоки занятий тренерского календаря**

В `apps/web/src/components/SessionsCalendar.tsx`:

- добавить к импорту lucide: `Check`, `X` → `import { Check, ChevronLeft, ChevronRight, Wifi, X } from 'lucide-react';`
- добавить хелпер рядом с `tileClasses`:

```tsx
function ConfirmMark({ value }: { value: SessionResponse['clientConfirmation'] }) {
  if (value === 'confirmed') return <Check size={12} strokeWidth={2.4} className="shrink-0" />;
  if (value === 'declined')
    return <X size={12} strokeWidth={2.4} className="shrink-0 opacity-70" />;
  return null;
}
```

- в `DayView`-блоке в строку с `Wifi` и меткой добавить после `<span>{renderLabel(s)}</span>`:
  `<ConfirmMark value={s.clientConfirmation} />`.
- в `WeekView`-блоке добавить `<ConfirmMark value={s.clientConfirmation} />` рядом с `Wifi`/меткой
  (внутри существующего `<button>`).

Тренерская семантика: ✓ — клиент подтвердил, ✕ — отклонил, ничего — ждёт ответа.
Логику создания/редактирования НЕ трогать.

- [ ] **Step 2: Проверить типы и линт web**

Run: `npm run typecheck -w apps/web && npm run lint -w apps/web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/SessionsCalendar.tsx
git commit -m "feat(web): индикатор ответа клиента на блоках календаря тренера"
```

---

## Финал

- [ ] Полный `npm run check` зелёный (контроллер).
- [ ] Прогон itest против `trener_test` (контроллер): sessions + client-app-calendar — зелёные.
- [ ] Контроллер: пересборка docker (api + web-client), миграция 0027 применена к `trener`,
      live-проверка curl: регистрация клиента → привязка тренером → создание занятия →
      `GET /api/client/sessions` → `POST .../confirmation`.
- [ ] superpowers:finishing-a-development-branch.

## Self-review (план против спеки)

- Миграция 0027 + check-constraint → Task 2 ✓
- Контракт `clientConfirmation`/confirm-request → Task 1 ✓
- `listForClient` (без скрытия онлайн) + `setClientConfirmation` (scoped) → Tasks 3–4 ✓
- Фасад `client-app-calendar` (GET список, POST confirmation, 401/409/404) → Task 5 ✓
- Порт сетки + хелперов, `onSlotClick` опционален, индикатор подтверждения → Tasks 6–7 ✓
- Хуки (409→[], polling) + экран (лист, кнопки скрыты для прошедших, приглашение при 409) → Tasks 8–9 ✓
- Тренерский индикатор ответа → Task 10 ✓
- Тесты: unit сервиса, isolation itest (свои/чужие, онлайн виден, чужое → 404) → Tasks 4–5 ✓
- Типы согласованы: `clientConfirmation` enum один и тот же везде; методы repo↔service↔facade
  совпадают по сигнатурам (`listForClient(trainerId, clientId, range)`,
  `setClientConfirmation(trainerId, clientId, id, status)`).
