# Клиентское приложение — раздел «Чат». План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать клиенту чат с тренером: лента сообщений (поллинг), отправка, отметка прочитанного и бейдж непрочитанных на вкладке «Чат».

**Architecture:** Доработка общего chat-модуля (роль отправителя как параметр; клиентская модель прочтения `clientLastReadAt`) + тонкий фасад `client-app-chat` (`requireClient → resolveScope → chat service`). Фронт `apps/web-client` — экран чата + бейдж в нижней навигации, реал-тайм поллингом.

**Tech Stack:** Fastify 5, Drizzle, Postgres, Zod (`@trener/shared`), React 18, Vite, TanStack Query, vitest.

**Спека:** [docs/superpowers/specs/2026-06-03-web-client-chat-design.md](../specs/2026-06-03-web-client-chat-design.md)

**Соглашения:** команды из корня репо. Бэкенд itest требует Postgres + `DATABASE_URL` (локально docker :5432); без него `*.itest.ts` скипаются (норма для имплементера; прогон с БД — контроллер). Docker/миграции имплементер не запускает (миграцию генерирует, не применяет). Pre-commit гоняет eslint+prettier.

**Порядок намеренный** — каждый коммит зелёный. Тренерские chat-роуты НЕ меняются (роль отправителя получает default `'trainer'`).

---

## Карта файлов

**Бэкенд**

- Modify: `apps/api/src/db/schema.ts` — `conversations` += `clientLastReadAt`.
- Create: `apps/api/drizzle/00XX_*.sql` (+ meta) — миграция.
- Modify: `apps/api/src/modules/chat/chat.repo.ts` — `ConversationRow`/`conversationColumns` += clientLastReadAt; `addMessage` (+senderRole); `markReadByClient`; `clientUnreadCount`.
- Modify: `apps/api/src/modules/chat/chat.repo.itest.ts` — кейсы новых методов.
- Modify: `apps/api/src/modules/chat/chat.service.ts` — `sendMessage` (+senderRole default), `markReadByClient`, `clientUnread`.
- Modify: `apps/api/src/modules/chat/chat.service.test.ts` — тест роли.
- Create: `apps/api/src/modules/client-app-chat/client-app-chat.routes.ts`, `client-app-chat.module.ts`, `client-app-chat.isolation.itest.ts`.
- Modify: `apps/api/src/app.ts` — регистрация фасада.

**Фронт `apps/web-client`**

- Create: `src/api/chat.ts` — хуки чата.
- Create: `src/pages/ChatPage.tsx` (+ `ChatPage.test.tsx`).
- Modify: `src/App.tsx` — `/chat` → ChatPage.
- Modify: `src/components/BottomNav.tsx` (+ `BottomNav.test.tsx`) — бейдж непрочитанных.
- Modify: `src/App.test.tsx` — мок `../api/chat` (BottomNav теперь дёргает unread).

---

## Phase 1 — Бэкенд

### Task 1: Миграция `conversations.clientLastReadAt`

**Files:**

- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/00XX_*.sql` (+ snapshot/journal)

- [ ] **Step 1: Добавить колонку**

В `apps/api/src/db/schema.ts`, в таблице `conversations`, добавить поле сразу ПОСЛЕ `trainerLastReadAt`:

```ts
    clientLastReadAt: timestamp('client_last_read_at', { withTimezone: true }),
```

- [ ] **Step 2: Сгенерировать миграцию**

Run: `npm run db:generate -w @trener/api`
Expected: новый `apps/api/drizzle/00XX_*.sql` с `ALTER TABLE "conversations" ADD COLUMN "client_last_read_at" timestamp with time zone;` + обновлён journal/snapshot.

- [ ] **Step 3: Проверить + типы**

Read новый `.sql` (1 ADD COLUMN). Run `npm run typecheck` — чисто.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/drizzle
git commit -m "feat(api): conversations.clientLastReadAt для прочтения клиентом"
```

(Применение миграции — контроллер.)

---

### Task 2: chat repo — роль отправителя, markReadByClient, clientUnreadCount

**Files:**

- Modify: `apps/api/src/modules/chat/chat.repo.ts`
- Modify: `apps/api/src/modules/chat/chat.repo.itest.ts`

- [ ] **Step 1: Падающий itest**

В `apps/api/src/modules/chat/chat.repo.itest.ts`, ВНУТРИ существующего `describe.skipIf(!url)(...)`, добавить (используется уже созданный в файле `repo`; берём пару trainer/client из существующих тестов — если их id отличаются, использовать свои уникальные `tA`/`cA`):

```ts
it('addMessage пишет роль клиента; clientUnreadCount и markReadByClient', async () => {
  const t = 'chatT1';
  const c = 'chatC1';
  const now = new Date();
  // сообщение тренера и клиента
  await repo.addMessage(t, c, 'm-tr', 'от тренера', now, 'trainer');
  await repo.addMessage(t, c, 'm-cl', 'от клиента', new Date(now.getTime() + 1000), 'client');

  const msgs = await repo.listMessages(t, c);
  expect(msgs.map((m) => m.senderRole)).toEqual(['trainer', 'client']);

  // клиент не читал → непрочитано только сообщение тренера (1)
  expect(await repo.clientUnreadCount(t, c)).toBe(1);

  // после прочтения клиентом → 0
  await repo.markReadByClient(t, c, new Date(now.getTime() + 2000));
  expect(await repo.clientUnreadCount(t, c)).toBe(0);

  // новое сообщение тренера снова даёт непрочитанное
  await repo.addMessage(t, c, 'm-tr2', 'ещё', new Date(now.getTime() + 3000), 'trainer');
  expect(await repo.clientUnreadCount(t, c)).toBe(1);
});
```

- [ ] **Step 2: Запустить — упасть**

PowerShell:

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/trener'; npm run test -- chat.repo
```

Expected: FAIL — `addMessage` не принимает 6-й арг / нет `clientUnreadCount`/`markReadByClient`. (Без БД — skipped.)

- [ ] **Step 3: Реализовать в repo**

В `apps/api/src/modules/chat/chat.repo.ts`:

(а) В тип `ConversationRow` добавить поле (после `trainerLastReadAt`):

```ts
clientLastReadAt: Date | null;
```

(б) В `conversationColumns` добавить (после `trainerLastReadAt`):

```ts
  clientLastReadAt: conversations.clientLastReadAt,
```

(в) Заменить сигнатуру и тело `addMessage` — добавить параметр `senderRole` и использовать его:

```ts
    async addMessage(
      trainerId: string,
      clientId: string,
      messageId: string,
      body: string,
      now: Date,
      senderRole: 'trainer' | 'client',
    ): Promise<MessageRow> {
      const conversation = await getOrCreateConversation(trainerId, clientId, now);
      const row = await db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(messages)
          .values({
            id: messageId,
            conversationId: conversation.id,
            senderRole,
            body,
            createdAt: now,
          })
          .returning(messageColumns);
        await tx
          .update(conversations)
          .set({ lastMessageAt: now })
          .where(eq(conversations.id, conversation.id));
        return inserted;
      });
      return row!;
    },
```

(г) Добавить методы `markReadByClient` и `clientUnreadCount` (рядом с `markRead`):

```ts
    // Отметить диалог прочитанным КЛИЕНТОМ.
    async markReadByClient(trainerId: string, clientId: string, now: Date): Promise<void> {
      const conversation = await getOrCreateConversation(trainerId, clientId, now);
      await db
        .update(conversations)
        .set({ clientLastReadAt: now })
        .where(eq(conversations.id, conversation.id));
    },

    // Непрочитанные клиентом = сообщения тренера после clientLastReadAt (или все, если не читал).
    async clientUnreadCount(trainerId: string, clientId: string): Promise<number> {
      const conversation = await findConversation(trainerId, clientId);
      if (!conversation) return 0;
      const filters = [
        eq(messages.conversationId, conversation.id),
        eq(messages.senderRole, 'trainer'),
      ];
      if (conversation.clientLastReadAt !== null) {
        filters.push(gt(messages.createdAt, conversation.clientLastReadAt));
      }
      const rows = await db.select({ id: messages.id }).from(messages).where(and(...filters));
      return rows.length;
    },
```

(д) ВАЖНО: у `addMessage` теперь обязательный `senderRole`. Единственный вызывающий — `chat.service.sendMessage` (правится в Task 3). Здесь, в repo, других вызовов нет.

- [ ] **Step 4: Запустить — пройти**

PowerShell:

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/trener'; npm run test -- chat.repo
```

Expected: PASS. `npm run typecheck` — ПОКА может ругаться на `chat.service.ts:45` (addMessage без senderRole) — это чинит Task 3; если запускаешь typecheck здесь и он красный только из-за этого вызова, перейди к Task 3 (коммить Task 2 после прохождения repo-теста; общий typecheck станет зелёным после Task 3). Чтобы коммит Task 2 был самодостаточным, СРАЗУ внеси минимальную правку вызова в `chat.service.ts` (см. Task 3 Step 3а) в этом же коммите — тогда typecheck зелёный. **Действие: примени Task 3 Step 3а здесь же**, остальное из Task 3 — отдельно.

Реальность: чтобы не делать «красный» промежуток, в этом Task внеси правку вызова `addMessage` в сервисе:
В `apps/api/src/modules/chat/chat.service.ts`, метод `sendMessage` — заменить вызов на:

```ts
const row = await repo.addMessage(
  trainerId,
  clientId,
  deps.newId(),
  input.body,
  deps.now(),
  'trainer',
);
```

(полную параметризацию `sendMessage` сделает Task 3). После правки: `npm run typecheck` — чисто.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/chat/chat.repo.ts apps/api/src/modules/chat/chat.repo.itest.ts apps/api/src/modules/chat/chat.service.ts
git commit -m "feat(api): chat repo — роль отправителя, прочтение клиентом, счётчик непрочитанных"
```

---

### Task 3: chat service — параметр роли, markReadByClient, clientUnread

**Files:**

- Modify: `apps/api/src/modules/chat/chat.service.ts`
- Modify: `apps/api/src/modules/chat/chat.service.test.ts`

- [ ] **Step 1: Падающий unit-тест**

Прочитать `apps/api/src/modules/chat/chat.service.test.ts`, найти его `fakeRepo`-хелпер. Добавить в фейк (если отсутствуют) методы `markReadByClient: vi.fn(() => Promise.resolve())` и `clientUnreadCount: vi.fn(() => Promise.resolve(0))`, а мок `addMessage` оставить принимающим 6 аргументов. Затем добавить тест в describe сервиса:

```ts
it('sendMessage по умолчанию шлёт роль trainer, а с client — client', async () => {
  const addMessage = vi.fn((_t, _c, _id, body: string, _now, role: string) =>
    Promise.resolve({
      id: 'm1',
      conversationId: 'cv',
      senderRole: role,
      body,
      createdAt: new Date(0),
    }),
  );
  const svc = makeChatService(fakeRepo({ addMessage }), {
    newId: () => 'm1',
    now: () => new Date(0),
  });
  await svc.sendMessage('t', 'c', { body: 'hi' });
  expect(addMessage).toHaveBeenLastCalledWith('t', 'c', 'm1', 'hi', expect.any(Date), 'trainer');
  await svc.sendMessage('t', 'c', { body: 'yo' }, 'client');
  expect(addMessage).toHaveBeenLastCalledWith('t', 'c', 'm1', 'yo', expect.any(Date), 'client');
});
```

(Если `fakeRepo` в файле устроен иначе — адаптировать вызов под него, сохранив суть: дефолт 'trainer', явный 'client'.)

- [ ] **Step 2: Запустить — упасть**

Run: `npm run test -- chat.service`
Expected: FAIL — `sendMessage` ещё не принимает роль / шлёт хардкод.

- [ ] **Step 3: Реализовать в сервисе**

В `apps/api/src/modules/chat/chat.service.ts`:

(а) Заменить `sendMessage` на параметризованный (default 'trainer'):

```ts
    async sendMessage(
      trainerId: string,
      clientId: string,
      input: SendMessageRequest,
      senderRole: 'trainer' | 'client' = 'trainer',
    ): Promise<MessageResponse> {
      const row = await repo.addMessage(
        trainerId,
        clientId,
        deps.newId(),
        input.body,
        deps.now(),
        senderRole,
      );
      return toMessageResponse(row);
    },
```

(б) Добавить методы (после `markRead`):

```ts
    async markReadByClient(trainerId: string, clientId: string): Promise<void> {
      await repo.markReadByClient(trainerId, clientId, deps.now());
    },

    clientUnread(trainerId: string, clientId: string): Promise<number> {
      return repo.clientUnreadCount(trainerId, clientId);
    },
```

- [ ] **Step 4: Запустить — пройти + типы**

Run: `npm run test -- chat.service` → PASS.
Run: `npm run typecheck` → чисто.
Run: `npm run test -- chat` → существующие тренерские chat-тесты зелёные (default 'trainer' сохраняет поведение).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/chat/chat.service.ts apps/api/src/modules/chat/chat.service.test.ts
git commit -m "feat(api): chat service — параметр роли, markReadByClient, clientUnread"
```

---

### Task 4: Фасад `client-app-chat` + регистрация + isolation itest

**Files:**

- Create: `apps/api/src/modules/client-app-chat/client-app-chat.routes.ts`
- Create: `apps/api/src/modules/client-app-chat/client-app-chat.module.ts`
- Create: `apps/api/src/modules/client-app-chat/client-app-chat.isolation.itest.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Падающий isolation itest**

Create `apps/api/src/modules/client-app-chat/client-app-chat.isolation.itest.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { buildApp } from '../../app.js';
import { createDb } from '../../db/client.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('client-app-chat (isolation)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    await db.execute(sql`DELETE FROM messages`);
    await db.execute(sql`DELETE FROM conversations`);
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

  it('переписка клиент↔тренер: лента, отправка, непрочитанные, прочтение', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'chat@b.co', password: 'longenough1', firstName: 'К', lastName: 'Л' },
    });
    const accId = reg.json<{ account: { id: string } }>().account.id;
    const cSid = clientSid(reg);

    // до привязки — 409
    const before = await app.inject({
      method: 'GET',
      url: '/api/client/chat/messages',
      cookies: { client_sid: cSid },
    });
    expect(before.statusCode).toBe(409);

    // тренер + клиент с привязкой
    const regT = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'tch@b.co', password: 'longenough1', firstName: 'Т', lastName: 'Р' },
    });
    const tSid = trainerSid(regT);
    const cli = await app.inject({
      method: 'POST',
      url: '/api/clients',
      cookies: { sid: tSid },
      payload: { firstName: 'Кли', lastName: 'Ент', accountId: accId },
    });
    const clientId = cli.json<{ client: { id: string } }>().client.id;

    // тренер пишет клиенту
    await app.inject({
      method: 'POST',
      url: `/api/clients/${clientId}/messages`,
      cookies: { sid: tSid },
      payload: { body: 'Привет от тренера' },
    });

    // клиент видит сообщение тренера и 1 непрочитанное
    const list = await app.inject({
      method: 'GET',
      url: '/api/client/chat/messages',
      cookies: { client_sid: cSid },
    });
    expect(list.statusCode).toBe(200);
    const msgs = list.json<{ messages: { senderRole: string; body: string }[] }>().messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.senderRole).toBe('trainer');

    const unread1 = await app.inject({
      method: 'GET',
      url: '/api/client/chat/unread',
      cookies: { client_sid: cSid },
    });
    expect(unread1.json<{ count: number }>().count).toBe(1);

    // клиент отправляет сообщение (роль client)
    const sent = await app.inject({
      method: 'POST',
      url: '/api/client/chat/messages',
      cookies: { client_sid: cSid },
      payload: { body: 'Привет, тренер' },
    });
    expect(sent.statusCode).toBe(200);
    expect(sent.json<{ message: { senderRole: string } }>().message.senderRole).toBe('client');

    // тренер видит 2 сообщения, последнее — от клиента
    const tList = await app.inject({
      method: 'GET',
      url: `/api/clients/${clientId}/messages`,
      cookies: { sid: tSid },
    });
    const tMsgs = tList.json<{ messages: { senderRole: string }[] }>().messages;
    expect(tMsgs).toHaveLength(2);
    expect(tMsgs[1]!.senderRole).toBe('client');

    // клиент отмечает прочитанным → непрочитанных 0
    await app.inject({
      method: 'POST',
      url: '/api/client/chat/read',
      cookies: { client_sid: cSid },
    });
    const unread2 = await app.inject({
      method: 'GET',
      url: '/api/client/chat/unread',
      cookies: { client_sid: cSid },
    });
    expect(unread2.json<{ count: number }>().count).toBe(0);
  });

  it('без сессии → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/client/chat/messages' });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Запустить — упасть**

PowerShell:

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/trener'; npm run test -- client-app-chat
```

Expected: FAIL (роуты отсутствуют → 404). Без БД — skipped.

- [ ] **Step 3: Роуты фасада**

Create `apps/api/src/modules/client-app-chat/client-app-chat.routes.ts`:

```ts
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  sendMessageRequestSchema,
  messageResponseSchema,
  messageListResponseSchema,
  type ClientLink,
} from '@trener/shared';
import type { ChatService } from '../chat/chat.service.js';
import { requireClient } from '../../plugins/client-context.js';
import { AppError, unauthorized } from '../../errors.js';

type ResolveScope = (clientAccountId: string) => Promise<ClientLink>;

const messageWrap = z.object({ message: messageResponseSchema });
const unreadResponse = z.object({ count: z.number() });
const okResponse = z.object({ ok: z.literal(true) });
const messagesQuery = z.object({ sinceId: z.string().optional() });

export function clientAppChatRoutes(
  app: FastifyInstance,
  svc: ChatService,
  resolveScope: ResolveScope,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  async function scope(req: FastifyRequest): Promise<{ trainerId: string; clientId: string }> {
    if (!req.clientAccountId) throw unauthorized('Требуется вход');
    const link = await resolveScope(req.clientAccountId);
    if (!link) throw new AppError(409, 'NOT_LINKED', 'Аккаунт не подключён к тренеру');
    return link;
  }

  typed.get(
    '/api/client/chat/messages',
    {
      preHandler: requireClient,
      schema: { querystring: messagesQuery, response: { 200: messageListResponseSchema } },
    },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      const options = req.query.sinceId !== undefined ? { sinceId: req.query.sinceId } : {};
      return { messages: await svc.listMessages(trainerId, clientId, options) };
    },
  );

  typed.post(
    '/api/client/chat/messages',
    {
      preHandler: requireClient,
      schema: { body: sendMessageRequestSchema, response: { 200: messageWrap } },
    },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      return { message: await svc.sendMessage(trainerId, clientId, req.body, 'client') };
    },
  );

  typed.post(
    '/api/client/chat/read',
    { preHandler: requireClient, schema: { response: { 200: okResponse } } },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      await svc.markReadByClient(trainerId, clientId);
      return { ok: true as const };
    },
  );

  typed.get(
    '/api/client/chat/unread',
    { preHandler: requireClient, schema: { response: { 200: unreadResponse } } },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      return { count: await svc.clientUnread(trainerId, clientId) };
    },
  );
}
```

- [ ] **Step 4: Модуль фасада**

Create `apps/api/src/modules/client-app-chat/client-app-chat.module.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import type { ClientLink } from '@trener/shared';
import { makeChatRepo } from '../chat/chat.repo.js';
import { makeChatService } from '../chat/chat.service.js';
import { clientAppChatRoutes } from './client-app-chat.routes.js';

export function registerClientAppChatModule(
  app: FastifyInstance,
  deps: { db: Db; clock: Clock; resolveScope: (id: string) => Promise<ClientLink> },
): void {
  const svc = makeChatService(makeChatRepo(deps.db), {
    newId: deps.clock.newId,
    now: deps.clock.now,
  });
  clientAppChatRoutes(app, svc, deps.resolveScope);
}
```

- [ ] **Step 5: Регистрация в app.ts**

В `apps/api/src/app.ts`:
(а) импорт после `import { registerClientAppWorkoutsModule } ...`:

```ts
import { registerClientAppChatModule } from './modules/client-app-chat/client-app-chat.module.js';
```

(б) после `registerClientAppWorkoutsModule(app, { ... });` добавить:

```ts
registerClientAppChatModule(app, {
  db: deps.db,
  clock,
  resolveScope: (id) => clientAuthSvc.resolveScope(id),
});
```

(`clientAuthSvc` уже захвачен в app.ts из `registerClientAuthModule`.)

- [ ] **Step 6: Запустить — пройти + типы**

PowerShell:

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/trener'; npm run test -- client-app-chat
```

Expected: PASS (2 теста). `npm run typecheck` — чисто.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/client-app-chat apps/api/src/app.ts
git commit -m "feat(api): фасад /api/client/chat (лента, отправка, прочтение, непрочитанные)"
```

---

## Phase 2 — Фронт

### Task 5: API-хуки чата

**Files:**

- Create: `apps/web-client/src/api/chat.ts`

- [ ] **Step 1: Реализовать хуки**

Create `apps/web-client/src/api/chat.ts`:

```ts
import {
  messageListResponseSchema,
  messageResponseSchema,
  type MessageResponse,
  type SendMessageRequest,
} from '@trener/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, ApiError } from './client';

const messageWrap = z.object({ message: messageResponseSchema });
const unreadResponse = z.object({ count: z.number() });

export const clientMessagesQueryKey = ['client', 'chat', 'messages'] as const;
export const clientChatUnreadQueryKey = ['client', 'chat', 'unread'] as const;

/** Лента сообщений (поллинг). 409 (нет тренера) → пустой список. */
export function useClientMessages() {
  return useQuery<MessageResponse[]>({
    queryKey: clientMessagesQueryKey,
    queryFn: async () => {
      try {
        const r = await apiFetch('/client/chat/messages', { schema: messageListResponseSchema });
        return r.messages;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) return [];
        throw err;
      }
    },
    refetchInterval: 4000,
  });
}

/** Счётчик непрочитанных для бейджа (поллинг). 409 → 0. */
export function useClientChatUnread() {
  return useQuery<number>({
    queryKey: clientChatUnreadQueryKey,
    queryFn: async () => {
      try {
        const r = await apiFetch('/client/chat/unread', { schema: unreadResponse });
        return r.count;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) return 0;
        throw err;
      }
    },
    refetchInterval: 10000,
  });
}

export function useSendClientMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SendMessageRequest) =>
      apiFetch('/client/chat/messages', { method: 'POST', body: input, schema: messageWrap }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientMessagesQueryKey });
      void qc.invalidateQueries({ queryKey: clientChatUnreadQueryKey });
    },
  });
}

export function useMarkChatRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch('/client/chat/read', {
        method: 'POST',
        schema: z.object({ ok: z.literal(true) }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientChatUnreadQueryKey });
    },
  });
}
```

- [ ] **Step 2: Типы**

Run: `npx tsc --noEmit -p apps/web-client/tsconfig.app.json` — чисто.

- [ ] **Step 3: Commit**

```bash
git add apps/web-client/src/api/chat.ts
git commit -m "feat(web-client): api-хуки чата"
```

---

### Task 6: Экран «Чат» + маршрут + smoke

**Files:**

- Create: `apps/web-client/src/pages/ChatPage.tsx`
- Create: `apps/web-client/src/pages/ChatPage.test.tsx`
- Modify: `apps/web-client/src/App.tsx`

- [ ] **Step 1: Реализовать ChatPage**

Create `apps/web-client/src/pages/ChatPage.tsx`:

```tsx
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useClientMe } from '../api/auth';
import { useClientMessages, useMarkChatRead, useSendClientMessage } from '../api/chat';

export function ChatPage() {
  const me = useClientMe();
  const linked = me.data?.link != null;
  const messages = useClientMessages();
  const send = useSendClientMessage();
  const markRead = useMarkChatRead();
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  // Автоскролл вниз при изменении числа сообщений.
  const count = messages.data?.length ?? 0;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [count]);

  // Отметить прочитанным при заходе (только если привязан).
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

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="px-4 pt-5 font-[family-name:var(--font-display)] text-[28px] text-ink">Чат</h1>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4">
        {messages.data && messages.data.length === 0 && (
          <p className="m-auto text-sm text-ink-muted">Сообщений пока нет.</p>
        )}
        {messages.data?.map((m) => (
          <div
            key={m.id}
            className={`max-w-[80%] rounded-2xl px-3 py-2 text-[14px] ${
              m.senderRole === 'client'
                ? 'self-end bg-accent text-accent-on'
                : 'self-start bg-card text-ink'
            }`}
          >
            {m.body}
          </div>
        ))}
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

- [ ] **Step 2: Маршрут**

В `apps/web-client/src/App.tsx`:
(а) импорт после `import { ProfilePage } from './pages/ProfilePage';`:

```tsx
import { ChatPage } from './pages/ChatPage';
```

(б) заменить `<Route path="/chat" element={<StubPage title="Чат" />} />` на:

```tsx
<Route path="/chat" element={<ChatPage />} />
```

- [ ] **Step 3: Smoke-тест**

Create `apps/web-client/src/pages/ChatPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChatPage } from './ChatPage';
import * as auth from '../api/auth';
import * as chat from '../api/chat';

vi.mock('../api/auth');
vi.mock('../api/chat');

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
    vi.mocked(chat.useClientMessages).mockReturnValue({ data: [] } as never);
  });

  it('не привязан → приглашение подключить тренера', () => {
    mockMe(false);
    renderPage();
    expect(screen.getByText('Подключите тренера, чтобы написать ему.')).toBeInTheDocument();
  });

  it('привязан, показывает пузыри по ролям', () => {
    mockMe(true);
    vi.mocked(chat.useClientMessages).mockReturnValue({
      data: [
        { id: 'm1', senderRole: 'trainer', body: 'Привет', createdAt: '2026-06-03T08:00:00Z' },
        { id: 'm2', senderRole: 'client', body: 'Здравствуйте', createdAt: '2026-06-03T08:01:00Z' },
      ],
    } as never);
    renderPage();
    expect(screen.getByText('Привет')).toBeInTheDocument();
    expect(screen.getByText('Здравствуйте')).toBeInTheDocument();
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

NOTE on jsdom: `scrollIntoView` may be undefined in jsdom. If the send/render tests throw on `endRef.current?.scrollIntoView`, the optional chaining guards null but jsdom defines the element without the method → call throws. If tests fail with `scrollIntoView is not a function`, add to `apps/web-client/src/test/setup.ts`:

```ts
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
```

Apply that only if needed.

- [ ] **Step 4: Тесты + сборка**

Run: `npm run test -w @trener/web-client -- ChatPage` → PASS (3).
Run: `npm run build -w @trener/web-client` → чисто.

- [ ] **Step 5: Commit**

```bash
git add apps/web-client/src/pages/ChatPage.tsx apps/web-client/src/pages/ChatPage.test.tsx apps/web-client/src/App.tsx apps/web-client/src/test/setup.ts
git commit -m "feat(web-client): экран чата с тренером"
```

---

### Task 7: Бейдж непрочитанных на вкладке «Чат»

**Files:**

- Modify: `apps/web-client/src/components/BottomNav.tsx`
- Modify: `apps/web-client/src/App.test.tsx`
- Create: `apps/web-client/src/components/BottomNav.test.tsx`

- [ ] **Step 1: Бейдж в BottomNav**

Read `apps/web-client/src/components/BottomNav.tsx`. Add the unread hook and render a badge over the «Чат» item. Replace the file content with (preserving the existing ITEMS/structure, adding unread):

```tsx
import { NavLink } from 'react-router-dom';
import { Dumbbell, Calendar, MessageCircle, TrendingUp, User } from 'lucide-react';
import { useClientChatUnread } from '../api/chat';

const ITEMS = [
  { to: '/', label: 'Тренировки', Icon: Dumbbell, end: true },
  { to: '/calendar', label: 'Календарь', Icon: Calendar, end: false },
  { to: '/chat', label: 'Чат', Icon: MessageCircle, end: false },
  { to: '/progress', label: 'Прогресс', Icon: TrendingUp, end: false },
  { to: '/profile', label: 'Профиль', Icon: User, end: false },
];

export function BottomNav() {
  const unread = useClientChatUnread();
  const chatUnread = unread.data ?? 0;
  return (
    <nav className="sticky bottom-0 z-10 flex border-t border-line bg-bg/95 backdrop-blur">
      {ITEMS.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] ${
              isActive ? 'text-accent' : 'text-ink-muted'
            }`
          }
        >
          <span className="relative">
            <Icon size={22} />
            {to === '/chat' && chatUnread > 0 && (
              <span className="absolute -right-2 -top-1 min-w-[16px] rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-4 text-white">
                {chatUnread > 9 ? '9+' : chatUnread}
              </span>
            )}
          </span>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
```

(Бейдж — единственное место реального действия-уведомления; `bg-danger` здесь допустим как severity-индикатор, не текст.)

- [ ] **Step 2: Обновить App.test.tsx — мок `../api/chat`**

В `apps/web-client/src/App.test.tsx` BottomNav теперь вызывает `useClientChatUnread`. Добавить мок, чтобы тесты гейта не дёргали сеть:
(а) после `vi.mock('./api/workouts');` добавить `vi.mock('./api/chat');`
(б) в импортах добавить `import * as chat from './api/chat';`
(в) в `beforeEach` добавить:

```ts
vi.mocked(chat.useClientChatUnread).mockReturnValue({ data: 0 } as never);
```

- [ ] **Step 3: Smoke-тест BottomNav**

Create `apps/web-client/src/components/BottomNav.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import * as chat from '../api/chat';

vi.mock('../api/chat');

function renderNav() {
  return render(
    <MemoryRouter>
      <BottomNav />
    </MemoryRouter>,
  );
}

describe('BottomNav', () => {
  beforeEach(() => vi.resetAllMocks());

  it('без непрочитанных — бейджа нет', () => {
    vi.mocked(chat.useClientChatUnread).mockReturnValue({ data: 0 } as never);
    renderNav();
    expect(screen.queryByText('3')).not.toBeInTheDocument();
    expect(screen.getByText('Чат')).toBeInTheDocument();
  });

  it('есть непрочитанные — показывает счётчик', () => {
    vi.mocked(chat.useClientChatUnread).mockReturnValue({ data: 3 } as never);
    renderNav();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Тесты + сборка**

Run: `npm run test -w @trener/web-client` → все зелёные (App gate, ChatPage, BottomNav, прочие).
Run: `npm run build -w @trener/web-client` → чисто.

- [ ] **Step 5: Commit**

```bash
git add apps/web-client/src/components/BottomNav.tsx apps/web-client/src/components/BottomNav.test.tsx apps/web-client/src/App.test.tsx
git commit -m "feat(web-client): бейдж непрочитанных на вкладке «Чат»"
```

---

## Финальная проверка

- [ ] **Гейт качества:** `npm run check` (format+lint+typecheck+test, itest скипнут без БД) — зелёный.
- [ ] **Прогон с БД (контроллер):** `DATABASE_URL=... npm run test` — включая chat.repo и client-app-chat.isolation — зелёное.
- [ ] **Живой smoke (контроллер):** применить миграцию, пересобрать api+web-client; тренер пишет клиенту → у клиента в `:8081` бейдж на «Чат», открывает чат (бейдж гаснет), отвечает → тренер видит ответ.

---

## Self-review (выполнено при написании)

- **Покрытие спеки:** миграция clientLastReadAt (Task 1); repo роль/markReadByClient/clientUnreadCount (Task 2); service параметр роли/markReadByClient/clientUnread (Task 3); фасад 4 роута + 409/401 (Task 4); хуки (Task 5); экран чата + пузыри/пусто/непривязан/отправка/markRead (Task 6); бейдж (Task 7). Вне объёма (вложения, «печатает», вебсокеты, тренерская сторона) — не реализуется.
- **Зелёность на каждом шаге:** Task 2 включает минимальную правку вызова `addMessage` в сервисе (`'trainer'`), чтобы typecheck не краснел между Task 2 и Task 3; тренерское поведение сохраняется (default остаётся 'trainer' после Task 3).
- **Типы согласованы:** `ChatService`/`MessageResponse`/`SendMessageRequest`/`ClientLink` едины в фасаде/хуках; `senderRole` 'trainer'|'client' везде; `addMessage` 6-арг сигнатура согласована repo↔service↔тест.
- **Плейсхолдеров нет.** jsdom `scrollIntoView`-полифилл помечен как «применять при необходимости».
