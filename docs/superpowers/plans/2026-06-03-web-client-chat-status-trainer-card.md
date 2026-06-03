# Статусы сообщений чата + карточка тренера у клиента. План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Галочки ✓/✓✓ (отправлено/прочитано) в клиентском чате и карточка привязанного тренера (имя/специализация/о тренере/контакты) в профиле клиента и в шапке чата.

**Architecture:** «Прочитано» из `conversations.trainerLastReadAt` (отдаётся в ответе клиентской ленты). Новый фасад `client-app-trainer` отдаёт публичный профиль тренера через `resolveScope`. Заодно общий `scope()`-хелпер выносится в `core/client-scope.ts` (третий фасад).

**Tech Stack:** Fastify 5, Drizzle, Postgres, Zod (`@trener/shared`), React 18, Vite, TanStack Query, vitest, lucide-react.

**Спека:** [docs/superpowers/specs/2026-06-03-web-client-chat-status-trainer-card-design.md](../specs/2026-06-03-web-client-chat-status-trainer-card-design.md)

**Соглашения:** команды из корня. itest — Postgres + `DATABASE_URL`, но ТОЛЬКО против `trener_test` (НЕ боевая `trener` — её beforeAll чистит таблицы): `$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/trener_test'`. Без БД itest скипаются (норма для имплементера; прогон с БД — контроллер против trener_test). Docker/миграции имплементер не запускает. Эта доработка миграций НЕ требует.

---

## Карта файлов

**Бэкенд**

- Create: `apps/api/src/core/client-scope.ts` — общий `makeClientScope(resolveScope)`.
- Create: `apps/api/src/core/client-scope.test.ts`.
- Modify: `apps/api/src/modules/client-app-workouts/client-app-workouts.routes.ts`, `client-app-chat.routes.ts` — переключить на общий scope.
- Modify: `apps/api/src/modules/chat/chat.repo.ts` (`trainerReadAt`), `chat.service.ts` (`trainerReadAt`), `chat.repo.itest.ts`.
- Modify: `packages/shared/src/chat.ts` (`clientChatMessagesResponseSchema`); `packages/shared/src/auth.ts` (`trainerPublicResponseSchema`).
- Modify: `apps/api/src/modules/client-app-chat/client-app-chat.routes.ts` — GET messages → `{messages, trainerLastReadAt}`; `client-app-chat.isolation.itest.ts`.
- Create: `apps/api/src/modules/client-app-trainer/client-app-trainer.routes.ts`, `client-app-trainer.module.ts`, `client-app-trainer.isolation.itest.ts`.
- Modify: `apps/api/src/app.ts` — регистрация trainer-фасада.

**Фронт `apps/web-client`**

- Create: `src/api/trainer.ts` — `useClientTrainer`.
- Modify: `src/api/chat.ts` — `useClientMessages` → `{messages, trainerLastReadAt}`.
- Modify: `src/pages/ChatPage.tsx` (+ `ChatPage.test.tsx`) — галочки + имя тренера в шапке.
- Modify: `src/pages/ProfilePage.tsx` (+ `ProfilePage.test.tsx`) — карточка тренера.

---

## Phase 1 — Бэкенд

### Task 1: Общий `makeClientScope` (рефактор двух фасадов)

**Files:**

- Create: `apps/api/src/core/client-scope.ts`, `apps/api/src/core/client-scope.test.ts`
- Modify: `apps/api/src/modules/client-app-workouts/client-app-workouts.routes.ts`, `apps/api/src/modules/client-app-chat/client-app-chat.routes.ts`

- [ ] **Step 1: Падающий unit-тест**

Create `apps/api/src/core/client-scope.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { makeClientScope } from './client-scope.js';

function req(clientAccountId?: string) {
  return { clientAccountId } as never;
}

describe('makeClientScope', () => {
  it('нет clientAccountId → 401', async () => {
    const scope = makeClientScope(vi.fn());
    await expect(scope(req())).rejects.toMatchObject({ status: 401 });
  });

  it('resolveScope вернул null → 409 NOT_LINKED', async () => {
    const scope = makeClientScope(vi.fn(() => Promise.resolve(null)));
    await expect(scope(req('ca1'))).rejects.toMatchObject({ status: 409, code: 'NOT_LINKED' });
  });

  it('привязан → возвращает scope', async () => {
    const scope = makeClientScope(vi.fn(() => Promise.resolve({ trainerId: 't', clientId: 'c' })));
    expect(await scope(req('ca1'))).toEqual({ trainerId: 't', clientId: 'c' });
  });
});
```

- [ ] **Step 2: Запустить — упасть**

Run: `npm run test -- client-scope`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать хелпер**

Create `apps/api/src/core/client-scope.ts`:

```ts
import type { FastifyRequest } from 'fastify';
import type { ClientLink } from '@trener/shared';
import { AppError, unauthorized } from '../errors.js';

export type ResolveScope = (clientAccountId: string) => Promise<ClientLink>;
export type ClientScope = { trainerId: string; clientId: string };

// Скоуп клиента из сессии: нет аккаунта → 401, нет привязки → 409 NOT_LINKED.
export function makeClientScope(resolveScope: ResolveScope) {
  return async function scope(req: FastifyRequest): Promise<ClientScope> {
    if (!req.clientAccountId) throw unauthorized('Требуется вход');
    const link = await resolveScope(req.clientAccountId);
    if (!link) throw new AppError(409, 'NOT_LINKED', 'Аккаунт не подключён к тренеру');
    return link;
  };
}
```

- [ ] **Step 4: Запустить — пройти**

Run: `npm run test -- client-scope`
Expected: PASS (3 теста).

- [ ] **Step 5: Переключить workouts-фасад**

В `apps/api/src/modules/client-app-workouts/client-app-workouts.routes.ts`:

- Удалить локальные `type ResolveScope`, `unauthorized`/`AppError` (если используются ТОЛЬКО в `scope`) и функцию `scope`.
- Добавить импорт: `import { makeClientScope, type ResolveScope } from '../../core/client-scope.js';`
- Заменить `async function scope(req) {...}` на `const scope = makeClientScope(resolveScope);`
- Оставить `requireClient` и сами роуты без изменений (они зовут `scope(req)`).
- Параметр функции `resolveScope: ResolveScope` теперь импортируемого типа.
- Импорты `AppError`/`unauthorized` из `../../errors.js` удалить, если больше не используются в файле (проверить — иначе оставить).

- [ ] **Step 6: Переключить chat-фасад**

В `apps/api/src/modules/client-app-chat/client-app-chat.routes.ts` — аналогично Step 5: импортировать `makeClientScope`/`ResolveScope`, заменить локальную `scope` на `const scope = makeClientScope(resolveScope);`, удалить локальный `type ResolveScope` и неиспользуемые импорты `AppError`/`unauthorized`. `messageWrap`/`unreadResponse`/`okResponse`/`messagesQuery` и роуты не трогать.

- [ ] **Step 7: Проверить — типы + существующие itest**

Run: `npm run typecheck` → чисто.
PowerShell: `$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/trener_test'; npm run test -- "client-app-workouts|client-app-chat|client-scope"`
Expected: client-scope зелёный; isolation-itest зелёные с БД (или skipped без) — поведение фасадов не изменилось.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/core/client-scope.ts apps/api/src/core/client-scope.test.ts apps/api/src/modules/client-app-workouts/client-app-workouts.routes.ts apps/api/src/modules/client-app-chat/client-app-chat.routes.ts
git commit -m "refactor(api): общий makeClientScope для клиентских фасадов"
```

---

### Task 2: chat repo/service — `trainerReadAt`

**Files:**

- Modify: `apps/api/src/modules/chat/chat.repo.ts`, `chat.service.ts`, `chat.repo.itest.ts`

- [ ] **Step 1: Падающий itest**

В `apps/api/src/modules/chat/chat.repo.itest.ts`, внутри `describe.skipIf(!url)(...)`, добавить:

```ts
it('trainerReadAt: null без диалога, дата после markRead тренером', async () => {
  expect(await repo.trainerReadAt('tNo', 'cNo')).toBeNull();
  const t = 'chatRT';
  const c = 'chatRC';
  const now = new Date();
  await repo.addMessage(t, c, 'm-rt', 'hi', now, 'client');
  expect(await repo.trainerReadAt(t, c)).toBeNull(); // тренер ещё не читал
  await repo.markRead(t, c, new Date(now.getTime() + 1000)); // тренерский markRead → trainerLastReadAt
  const at = await repo.trainerReadAt(t, c);
  expect(at).toBeInstanceOf(Date);
});
```

- [ ] **Step 2: Запустить — упасть**

PowerShell: `$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/trener_test'; npm run test -- chat.repo`
Expected: FAIL — нет `trainerReadAt`. (Без БД — skipped.)

- [ ] **Step 3: Реализовать в repo**

В `apps/api/src/modules/chat/chat.repo.ts` добавить метод (рядом с `clientUnreadCount`):

```ts
    // Когда тренер последний раз читал диалог (для статуса «прочитано» у клиента).
    async trainerReadAt(trainerId: string, clientId: string): Promise<Date | null> {
      const conversation = await findConversation(trainerId, clientId);
      return conversation?.trainerLastReadAt ?? null;
    },
```

- [ ] **Step 4: Реализовать в service**

В `apps/api/src/modules/chat/chat.service.ts` добавить метод (после `clientUnread`):

```ts
    async trainerReadAt(trainerId: string, clientId: string): Promise<string | null> {
      const at = await repo.trainerReadAt(trainerId, clientId);
      return at ? at.toISOString() : null;
    },
```

- [ ] **Step 5: Запустить — пройти + типы**

PowerShell: `$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/trener_test'; npm run test -- chat`
Expected: PASS. `npm run typecheck` — чисто.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/chat/chat.repo.ts apps/api/src/modules/chat/chat.service.ts apps/api/src/modules/chat/chat.repo.itest.ts
git commit -m "feat(api): chat — trainerReadAt (момент прочтения тренером)"
```

---

### Task 3: Контракт ленты + chat-фасад отдаёт `trainerLastReadAt`

**Files:**

- Modify: `packages/shared/src/chat.ts`, `apps/api/src/modules/client-app-chat/client-app-chat.routes.ts`, `client-app-chat.isolation.itest.ts`

- [ ] **Step 1: Контракт в shared**

В `packages/shared/src/chat.ts` добавить после `messageListResponseSchema`:

```ts
export const clientChatMessagesResponseSchema = z.object({
  messages: z.array(messageResponseSchema),
  trainerLastReadAt: z.string().nullable(),
});
export type ClientChatMessagesResponse = z.infer<typeof clientChatMessagesResponseSchema>;
```

Затем `npm run build -w @trener/shared`.

- [ ] **Step 2: Падающее изменение itest**

В `apps/api/src/modules/client-app-chat/client-app-chat.isolation.itest.ts`, в существующем сценарном тесте, ПОСЛЕ получения `list` (GET /api/client/chat/messages тренерское сообщение уже отправлено) добавить проверку, что поле есть и пока null, а после клиентского read — дата. Найти блок где тренер отправил сообщение и клиент делает `GET messages`; добавить:

```ts
expect(list.json<{ trainerLastReadAt: string | null }>().trainerLastReadAt).toBeNull();
```

И в конце теста (после того как тренер прочитает — добавить тренерский markRead): добавить шаг, что после тренерского чтения клиентская лента показывает дату. Вставить перед финальными проверками:

```ts
// тренер читает диалог
await app.inject({
  method: 'POST',
  url: `/api/clients/${clientId}/messages/read`,
  cookies: { sid: tSid },
});
const list2 = await app.inject({
  method: 'GET',
  url: '/api/client/chat/messages',
  cookies: { client_sid: cSid },
});
expect(list2.json<{ trainerLastReadAt: string | null }>().trainerLastReadAt).not.toBeNull();
```

(Тренерский роут отметки прочтения — `POST /api/clients/:id/messages/read`, он есть в chat.routes.)

- [ ] **Step 3: Запустить — упасть**

PowerShell: `$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/trener_test'; npm run test -- client-app-chat`
Expected: FAIL — в ответе нет `trainerLastReadAt`.

- [ ] **Step 4: Обновить chat-фасад**

В `apps/api/src/modules/client-app-chat/client-app-chat.routes.ts`:

- В импорт из `@trener/shared` добавить `clientChatMessagesResponseSchema` (и убрать `messageListResponseSchema`, если больше не используется — оно использовалось только для GET messages).
- Изменить роут `GET /api/client/chat/messages`:

```ts
typed.get(
  '/api/client/chat/messages',
  {
    preHandler: requireClient,
    schema: { querystring: messagesQuery, response: { 200: clientChatMessagesResponseSchema } },
  },
  async (req) => {
    const { trainerId, clientId } = await scope(req);
    const options = req.query.sinceId !== undefined ? { sinceId: req.query.sinceId } : {};
    const [messages, trainerLastReadAt] = await Promise.all([
      svc.listMessages(trainerId, clientId, options),
      svc.trainerReadAt(trainerId, clientId),
    ]);
    return { messages, trainerLastReadAt };
  },
);
```

- [ ] **Step 5: Запустить — пройти + типы**

PowerShell: `$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/trener_test'; npm run test -- client-app-chat`
Expected: PASS. `npm run typecheck` — чисто.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/chat.ts apps/api/src/modules/client-app-chat/client-app-chat.routes.ts apps/api/src/modules/client-app-chat/client-app-chat.isolation.itest.ts
git commit -m "feat(api,shared): клиентская лента чата отдаёт trainerLastReadAt"
```

---

### Task 4: Публичный профиль тренера — контракт + фасад `client-app-trainer`

**Files:**

- Modify: `packages/shared/src/auth.ts`
- Create: `apps/api/src/modules/client-app-trainer/client-app-trainer.routes.ts`, `client-app-trainer.module.ts`, `client-app-trainer.isolation.itest.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Контракт в shared**

В `packages/shared/src/auth.ts` добавить после `trainerResponseSchema` (использует уже объявленный там `contactSchema`):

```ts
export const trainerPublicResponseSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  title: z.string().nullable(),
  bio: z.string().nullable(),
  contacts: z.array(contactSchema),
});
export type TrainerPublicResponse = z.infer<typeof trainerPublicResponseSchema>;
```

Затем `npm run build -w @trener/shared`.

- [ ] **Step 2: Падающий isolation itest**

Create `apps/api/src/modules/client-app-trainer/client-app-trainer.isolation.itest.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { buildApp } from '../../app.js';
import { createDb } from '../../db/client.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('client-app-trainer (isolation)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
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

  it('отдаёт публичный профиль тренера без email; 409 до привязки; 401 без сессии', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'tr-card@b.co', password: 'longenough1', firstName: 'К', lastName: 'Л' },
    });
    const accId = reg.json<{ account: { id: string } }>().account.id;
    const cSid = clientSid(reg);

    const before = await app.inject({
      method: 'GET',
      url: '/api/client/trainer',
      cookies: { client_sid: cSid },
    });
    expect(before.statusCode).toBe(409);

    const regT = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'thecoach@b.co',
        password: 'longenough1',
        firstName: 'Иван',
        lastName: 'Тренеров',
      },
    });
    const tSid = trainerSid(regT);
    // тренер задаёт специализацию/био
    await app.inject({
      method: 'PATCH',
      url: '/api/auth/me',
      cookies: { sid: tSid },
      payload: { title: 'Силовой тренер', bio: 'КМС по пауэрлифтингу' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/clients',
      cookies: { sid: tSid },
      payload: { firstName: 'Кли', lastName: 'Ент', accountId: accId },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/client/trainer',
      cookies: { client_sid: cSid },
    });
    expect(res.statusCode).toBe(200);
    const t = res.json<{ trainer: Record<string, unknown> }>().trainer;
    expect(t.firstName).toBe('Иван');
    expect(t.lastName).toBe('Тренеров');
    expect(t.title).toBe('Силовой тренер');
    expect(t.bio).toBe('КМС по пауэрлифтингу');
    expect(t.email).toBeUndefined();
    expect(t.passwordHash).toBeUndefined();

    const noAuth = await app.inject({ method: 'GET', url: '/api/client/trainer' });
    expect(noAuth.statusCode).toBe(401);
  });
});
```

- [ ] **Step 3: Запустить — упасть**

PowerShell: `$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/trener_test'; npm run test -- client-app-trainer`
Expected: FAIL — роут отсутствует (404).

- [ ] **Step 4: Роуты фасада**

Create `apps/api/src/modules/client-app-trainer/client-app-trainer.routes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { trainerPublicResponseSchema, type TrainerPublicResponse } from '@trener/shared';
import type { AuthRepo } from '../auth/auth.repo.js';
import { requireClient } from '../../plugins/client-context.js';
import { makeClientScope, type ResolveScope } from '../../core/client-scope.js';
import { notFound } from '../../errors.js';

const trainerWrap = z.object({ trainer: trainerPublicResponseSchema });

export function clientAppTrainerRoutes(
  app: FastifyInstance,
  authRepo: AuthRepo,
  resolveScope: ResolveScope,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const scope = makeClientScope(resolveScope);

  typed.get(
    '/api/client/trainer',
    { preHandler: requireClient, schema: { response: { 200: trainerWrap } } },
    async (req) => {
      const { trainerId } = await scope(req);
      const t = await authRepo.findTrainerById(trainerId);
      if (!t) throw notFound('Тренер не найден');
      const trainer: TrainerPublicResponse = {
        id: t.id,
        firstName: t.firstName,
        lastName: t.lastName,
        title: t.title,
        bio: t.bio,
        contacts: t.contacts,
      };
      return { trainer };
    },
  );
}
```

- [ ] **Step 5: Модуль фасада**

Create `apps/api/src/modules/client-app-trainer/client-app-trainer.module.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { ClientLink } from '@trener/shared';
import { makeAuthRepo } from '../auth/auth.repo.js';
import { clientAppTrainerRoutes } from './client-app-trainer.routes.js';

export function registerClientAppTrainerModule(
  app: FastifyInstance,
  deps: { db: Db; resolveScope: (id: string) => Promise<ClientLink> },
): void {
  clientAppTrainerRoutes(app, makeAuthRepo(deps.db), deps.resolveScope);
}
```

- [ ] **Step 6: Регистрация в app.ts**

В `apps/api/src/app.ts`:
(а) импорт после `registerClientAppChatModule`:

```ts
import { registerClientAppTrainerModule } from './modules/client-app-trainer/client-app-trainer.module.js';
```

(б) после вызова `registerClientAppChatModule(app, { ... });` добавить:

```ts
registerClientAppTrainerModule(app, {
  db: deps.db,
  resolveScope: (id) => clientAuthSvc.resolveScope(id),
});
```

- [ ] **Step 7: Запустить — пройти + типы**

PowerShell: `$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/trener_test'; npm run test -- client-app-trainer`
Expected: PASS. `npm run typecheck` — чисто.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/auth.ts apps/api/src/modules/client-app-trainer apps/api/src/app.ts
git commit -m "feat(api,shared): GET /api/client/trainer — публичный профиль тренера"
```

---

## Phase 2 — Фронт

### Task 5: Хук тренера `api/trainer.ts`

**Files:**

- Create: `apps/web-client/src/api/trainer.ts`

- [ ] **Step 1: Реализовать хук**

Create `apps/web-client/src/api/trainer.ts`:

```ts
import { trainerPublicResponseSchema, type TrainerPublicResponse } from '@trener/shared';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, ApiError } from './client';

const trainerWrap = z.object({ trainer: trainerPublicResponseSchema });

export const clientTrainerQueryKey = ['client', 'trainer'] as const;

/** Публичный профиль привязанного тренера. 409 (не привязан) → null. */
export function useClientTrainer() {
  return useQuery<TrainerPublicResponse | null>({
    queryKey: clientTrainerQueryKey,
    queryFn: async () => {
      try {
        const r = await apiFetch('/client/trainer', { schema: trainerWrap });
        return r.trainer;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) return null;
        throw err;
      }
    },
  });
}
```

- [ ] **Step 2: Типы**

Run: `npm run build -w @trener/shared` (для типа `TrainerPublicResponse`), затем `npx tsc --noEmit -p apps/web-client/tsconfig.app.json` — чисто.

- [ ] **Step 3: Commit**

```bash
git add apps/web-client/src/api/trainer.ts
git commit -m "feat(web-client): хук публичного профиля тренера"
```

---

### Task 6: Чат — галочки статусов + имя тренера в шапке

**Files:**

- Modify: `apps/web-client/src/api/chat.ts` (форма `useClientMessages`), `apps/web-client/src/pages/ChatPage.tsx`, `apps/web-client/src/pages/ChatPage.test.tsx`

- [ ] **Step 1: Изменить `useClientMessages` под новую форму**

В `apps/web-client/src/api/chat.ts`:

- В импорт из `@trener/shared` добавить `clientChatMessagesResponseSchema` (и убрать `messageListResponseSchema`, если оно использовалось только тут). Оставить `messageResponseSchema`/`MessageResponse`/`SendMessageRequest` (используются другими хуками).
- Заменить `useClientMessages`:

```ts
export function useClientMessages() {
  return useQuery<{ messages: MessageResponse[]; trainerLastReadAt: string | null }>({
    queryKey: clientMessagesQueryKey,
    queryFn: async () => {
      try {
        return await apiFetch('/client/chat/messages', {
          schema: clientChatMessagesResponseSchema,
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          return { messages: [], trainerLastReadAt: null };
        }
        throw err;
      }
    },
    refetchInterval: 4000,
  });
}
```

- [ ] **Step 2: Обновить ChatPage (форма данных + галочки + шапка)**

Заменить `apps/web-client/src/pages/ChatPage.tsx` на:

```tsx
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check, CheckCheck } from 'lucide-react';
import { useClientMe } from '../api/auth';
import { useClientMessages, useMarkChatRead, useSendClientMessage } from '../api/chat';
import { useClientTrainer } from '../api/trainer';

export function ChatPage() {
  const me = useClientMe();
  const linked = me.data?.link != null;
  const trainer = useClientTrainer();
  const messages = useClientMessages();
  const send = useSendClientMessage();
  const markRead = useMarkChatRead();
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const items = messages.data?.messages ?? [];
  const readAt = messages.data?.trainerLastReadAt ?? null;
  const count = items.length;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [count]);

  const markReadMutate = markRead.mutate;
  useEffect(() => {
    if (linked) markReadMutate();
  }, [linked, markReadMutate]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = text.trim();
    if (body === '' || send.isPending) return;
    send.mutate({ body }, { onSuccess: () => setText('') });
  }

  if (!linked) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-ink-muted">Подключите тренера, чтобы написать ему.</p>
        <Link to="/connect" className="text-sm font-semibold text-accent">
          Подключить тренера
        </Link>
      </div>
    );
  }

  const title = trainer.data ? `${trainer.data.firstName} ${trainer.data.lastName}` : 'Чат';

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="px-4 pt-5 font-[family-name:var(--font-display)] text-[24px] text-ink">
        {title}
      </h1>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4">
        {count === 0 && <p className="m-auto text-sm text-ink-muted">Сообщений пока нет.</p>}
        {items.map((m) => {
          const isClient = m.senderRole === 'client';
          const read = readAt !== null && m.createdAt <= readAt;
          return (
            <div
              key={m.id}
              className={`flex max-w-[80%] items-end gap-1 rounded-2xl px-3 py-2 text-[14px] ${
                isClient ? 'self-end bg-accent text-accent-on' : 'self-start bg-card text-ink'
              }`}
            >
              <span>{m.body}</span>
              {isClient &&
                (read ? (
                  <CheckCheck size={14} className="shrink-0 opacity-80" />
                ) : (
                  <Check size={14} className="shrink-0 opacity-60" />
                ))}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-line p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Сообщение…"
          className="min-w-0 flex-1 rounded-xl border border-line bg-chip px-3 py-2.5 text-base text-ink outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={text.trim() === '' || send.isPending}
          className="shrink-0 rounded-xl bg-accent px-4 py-2.5 font-semibold text-accent-on disabled:opacity-50"
        >
          Отпр.
        </button>
      </form>
    </div>
  );
}
```

(Статус-галочки на пузыре клиента — `text-accent-on` наследуется, галочки рисуются тем же цветом; «прочитано» = двойная, «отправлено» = одинарная. Сравнение `m.createdAt <= readAt` корректно для ISO-UTC строк.)

- [ ] **Step 3: Обновить smoke-тест чата**

Заменить `apps/web-client/src/pages/ChatPage.test.tsx` на (мокаем `../api/trainer`, новая форма `useClientMessages`):

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChatPage } from './ChatPage';
import * as auth from '../api/auth';
import * as chat from '../api/chat';
import * as trainerApi from '../api/trainer';

vi.mock('../api/auth');
vi.mock('../api/chat');
vi.mock('../api/trainer');

function mockMe(linked: boolean) {
  vi.mocked(auth.useClientMe).mockReturnValue({
    isLoading: false,
    data: {
      account: {
        id: 'ca1',
        email: 'a@b.co',
        firstName: 'И',
        lastName: 'К',
        avatarFileId: null,
        birthDate: null,
        contacts: [],
        bio: null,
      },
      link: linked ? { trainerId: 't1', clientId: 'cl1' } : null,
    },
  } as never);
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ChatPage />
    </MemoryRouter>,
  );
}

describe('ChatPage', () => {
  const sendMutate = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(chat.useMarkChatRead).mockReturnValue({ mutate: vi.fn() } as never);
    vi.mocked(chat.useSendClientMessage).mockReturnValue({
      mutate: sendMutate,
      isPending: false,
    } as never);
    vi.mocked(chat.useClientMessages).mockReturnValue({
      data: { messages: [], trainerLastReadAt: null },
    } as never);
    vi.mocked(trainerApi.useClientTrainer).mockReturnValue({ data: null } as never);
  });

  it('не привязан → приглашение подключить тренера', () => {
    mockMe(false);
    renderPage();
    expect(screen.getByText('Подключите тренера, чтобы написать ему.')).toBeInTheDocument();
  });

  it('шапка показывает имя тренера', () => {
    mockMe(true);
    vi.mocked(trainerApi.useClientTrainer).mockReturnValue({
      data: {
        id: 't1',
        firstName: 'Иван',
        lastName: 'Тренеров',
        title: null,
        bio: null,
        contacts: [],
      },
    } as never);
    renderPage();
    expect(screen.getByRole('heading', { name: 'Иван Тренеров' })).toBeInTheDocument();
  });

  it('своё сообщение: ✓✓ если прочитано, ✓ если нет', () => {
    mockMe(true);
    vi.mocked(chat.useClientMessages).mockReturnValue({
      data: {
        messages: [
          {
            id: 'm1',
            senderRole: 'client',
            body: 'прочитанное',
            createdAt: '2026-06-03T08:00:00Z',
          },
          { id: 'm2', senderRole: 'client', body: 'новое', createdAt: '2026-06-03T09:00:00Z' },
        ],
        trainerLastReadAt: '2026-06-03T08:30:00Z',
      },
    } as never);
    renderPage();
    // обе реплики отрисованы; иконки рядом — проверяем наличие текста
    expect(screen.getByText('прочитанное')).toBeInTheDocument();
    expect(screen.getByText('новое')).toBeInTheDocument();
  });

  it('отправка вызывает мутацию с body', () => {
    mockMe(true);
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('Сообщение…'), { target: { value: 'Тест' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отпр.' }));
    expect(sendMutate).toHaveBeenCalledWith({ body: 'Тест' }, expect.anything());
  });
});
```

- [ ] **Step 4: Тесты + сборка**

Run: `npm run test -w @trener/web-client -- ChatPage` → PASS (4).
Run: `npm run build -w @trener/web-client` → чисто.

- [ ] **Step 5: Commit**

```bash
git add apps/web-client/src/api/chat.ts apps/web-client/src/pages/ChatPage.tsx apps/web-client/src/pages/ChatPage.test.tsx
git commit -m "feat(web-client): статусы сообщений (✓/✓✓) и имя тренера в шапке чата"
```

---

### Task 7: Карточка тренера в Профиле

**Files:**

- Modify: `apps/web-client/src/pages/ProfilePage.tsx`, `apps/web-client/src/pages/ProfilePage.test.tsx`

- [ ] **Step 1: Карточка тренера в ProfileForm**

В `apps/web-client/src/pages/ProfilePage.tsx`:
(а) добавить импорт: `import { useClientTrainer } from '../api/trainer';`
(б) в компоненте `ProfileForm` вызвать хук в начале тела: `const trainer = useClientTrainer();`
(в) заменить блок статуса подключения (сейчас `{linked ? (<p>Вы подключены к тренеру.</p>) : (<Link>Подключить тренера</Link>)}`) на:

```tsx
{
  linked ? (
    <section className="flex flex-col gap-1 rounded-xl bg-card px-4 py-3">
      <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-mutedxl">
        Ваш тренер
      </span>
      {trainer.data ? (
        <>
          <span className="text-[15px] font-semibold text-ink">
            {trainer.data.firstName} {trainer.data.lastName}
          </span>
          {trainer.data.title && (
            <span className="text-[13px] text-ink-muted">{trainer.data.title}</span>
          )}
          {trainer.data.bio && (
            <span className="mt-1 text-[13px] text-ink-muted">{trainer.data.bio}</span>
          )}
          {trainer.data.contacts.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5">
              {trainer.data.contacts.map((c, i) => (
                <li key={i} className="text-[13px] text-ink-muted">
                  {c.type}: {c.value}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <span className="text-[13px] text-ink-muted">Загрузка…</span>
      )}
    </section>
  ) : (
    <Link
      to="/connect"
      className="rounded-xl bg-card px-4 py-3 text-[14px] font-semibold text-accent active:bg-card-elevated"
    >
      Подключить тренера
    </Link>
  );
}
```

- [ ] **Step 2: Обновить smoke-тест профиля**

В `apps/web-client/src/pages/ProfilePage.test.tsx`:
(а) добавить `vi.mock('../api/trainer');` и `import * as trainerApi from '../api/trainer';`
(б) в `beforeEach` добавить дефолт: `vi.mocked(trainerApi.useClientTrainer).mockReturnValue({ data: null } as never);`
(в) в тесте «показывает значения профиля…» (linked) — задать тренера и проверить карточку:

```ts
vi.mocked(trainerApi.useClientTrainer).mockReturnValue({
  data: {
    id: 't1',
    firstName: 'Иван',
    lastName: 'Тренеров',
    title: 'Силовой',
    bio: null,
    contacts: [],
  },
} as never);
```

и заменить проверку `expect(screen.getByText('Вы подключены к тренеру.'))` на:

```ts
expect(screen.getByText('Ваш тренер')).toBeInTheDocument();
expect(screen.getByText('Иван Тренеров')).toBeInTheDocument();
```

(г) тест «не подключён → ссылка Подключить тренера» оставить как есть (trainer.data = null, link = null → ветка `<Link>`).

- [ ] **Step 3: Тесты + сборка**

Run: `npm run test -w @trener/web-client -- ProfilePage` → PASS.
Run: `npm run build -w @trener/web-client` → чисто.

- [ ] **Step 4: Commit**

```bash
git add apps/web-client/src/pages/ProfilePage.tsx apps/web-client/src/pages/ProfilePage.test.tsx
git commit -m "feat(web-client): карточка тренера в профиле клиента"
```

---

## Финальная проверка

- [ ] **Гейт качества:** `npm run check` — зелёный (itest скипнут без БД).
- [ ] **Прогон с БД (контроллер):** `$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/trener_test'; npm run test` — включая chat.repo, client-app-chat, client-app-trainer — зелёное.
- [ ] **Живой smoke (контроллер):** пересобрать api+web-client; тренер с заполненными title/bio; клиент видит карточку тренера в Профиле и имя в шапке чата; своё сообщение получает ✓, после прочтения тренером — ✓✓.

---

## Self-review (выполнено при написании)

- **Покрытие спеки:** общий scope-хелпер (Task 1); trainerReadAt repo/service (Task 2); контракт ленты + фасад отдаёт trainerLastReadAt (Task 3); публичный профиль тренера контракт+фасад (Task 4); хук тренера (Task 5); галочки + имя тренера в шапке (Task 6); карточка тренера в профиле (Task 7). Фото/«доставлено»/статусы тренерских сообщений — вне объёма.
- **Зелёность на каждом шаге:** контракт ленты (Task 3) меняет форму ответа одновременно с фасадом; фронт `useClientMessages` переформатируется вместе с ChatPage (Task 6), а не раздельно. Хук тренера (Task 5) аддитивен. Рефактор scope (Task 1) поведение не меняет.
- **Типы согласованы:** `ResolveScope`/`makeClientScope` (core) ↔ оба фасада + trainer-фасад; `clientChatMessagesResponseSchema` ↔ chat-фасад + useClientMessages + ChatPage; `TrainerPublicResponse` ↔ shared + trainer-фасад + useClientTrainer + ChatPage/ProfilePage. Контакты `{type,value}` везде.
- **БД тестов:** все itest-команды используют `trener_test`, не боевую `trener`.
- **Плейсхолдеров нет.**
