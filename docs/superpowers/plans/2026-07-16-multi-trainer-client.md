# Multi-Trainer Client — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Позволить клиентскому приложению работать с несколькими тренерами: выбирать активного тренера и видеть весь раздел (чат, календарь, тренировки, прогресс, пакеты) в его скоупе.

**Architecture:** Единый чокпоинт `makeClientScope` начинает уважать переданный клиентом `X-Client-Scope: <clientId>` (fallback на первого тренера при отсутствии — обратная совместимость). Добавляется `GET /api/client/trainers`. Клиент хранит активного тренера, шлёт его в заголовке, при переключении сбрасывает все data-провайдеры. Пуши несут `?scope=<clientId>` для перехода к нужному тренеру.

**Tech Stack:** Backend — Fastify + Drizzle + Zod + vitest (`*.test.ts` unit, `*.itest.ts` против trener_test). Mobile — Flutter + Riverpod + go_router + Dio (core `ApiClient`).

## Global Constraints

- itest-ы гонять ТОЛЬКО против `trener_test` (их `beforeAll` стирает таблицы). Unit `*.test.ts` — без БД.
- Backend сборка: `cd apps/api && npm run build` (tsc -b). Unit: `npx vitest run <path>` из корня репо.
- Mobile: правки под `mobile/apps/client` и `mobile/packages/core`; проверка `flutter analyze` (юнит-тестов у мобилки нет — гейт качества analyze + ручной смоук).
- Тренерское приложение НЕ должно затрагиваться: `scopeProvider` в core опционален, тренер его не передаёт.
- Не коммитить/не пересобирать APK без явной просьбы пользователя (правило проекта). Коммиты по задачам — да.
- В UI: красный (`c.danger`) только для иконок severity и кнопок реального действия; в тексте — нейтральные ink-токены.

---

## Phase A — Backend: скоуп по выбранному тренеру

### Task 1: Резолвер привязки по (accountId, clientId)

**Files:**

- Modify: `apps/api/src/modules/client-auth/client-auth.repo.ts` (добавить метод `findScopeByAccountAndClient`)
- Modify: `apps/api/src/modules/client-auth/client-auth.service.ts` (`resolveScope` принимает опциональный `targetClientId`)
- Test: `apps/api/src/modules/client-auth/client-auth.repo.itest.ts` (новый it-блок)

**Interfaces:**

- Produces (repo): `findScopeByAccountAndClient(accountId: string, clientId: string): Promise<{ trainerId: string; clientId: string } | null>`
- Produces (service): `resolveScope(clientAccountId: string, targetClientId?: string): Promise<ClientLink>` — если `targetClientId` задан, возвращает привязку строго по нему (или `null`, если аккаунт ей не владеет); иначе прежнее поведение (первый тренер).

- [ ] **Step 1: Написать падающий itest** — в `client-auth.repo.itest.ts` добавить:

```ts
it('findScopeByAccountAndClient: только своя привязка аккаунта, иначе null', async () => {
  // Два тренера привязали один аккаунт 'acc1' → две карточки clients.
  await repo /* или прямые insert-хелперы файла */;
  // Готовим: trainer A→client cA, trainer B→client cB, обе с accountId 'acc1', обе active.
  const own = await repo.findScopeByAccountAndClient('acc1', 'cB');
  expect(own).toEqual({ trainerId: 'B', clientId: 'cB' });
  const foreign = await repo.findScopeByAccountAndClient('acc1', 'cX'); // чужой clientId
  expect(foreign).toBeNull();
});
```

(Использовать те же фикстуры/insert-хелперы, что и соседние itest-ы в файле — посмотреть их шапку `beforeAll`/`seed`.)

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run apps/api/src/modules/client-auth/client-auth.repo.itest.ts -t "findScopeByAccountAndClient"`
Expected: FAIL — `repo.findScopeByAccountAndClient is not a function`.
(Требуется поднятый `trener_test`. Если недоступен — пометить и вернуться на общем прогоне itest.)

- [ ] **Step 3: Реализовать метод в repo** — рядом с `findScopeByAccountId`:

```ts
async findScopeByAccountAndClient(
  clientAccountId: string,
  clientId: string,
): Promise<{ trainerId: string; clientId: string } | null> {
  const [row] = await db
    .select({ trainerId: trainerClients.trainerId, clientId: trainerClients.clientId })
    .from(clients)
    .innerJoin(trainerClients, eq(trainerClients.clientId, clients.id))
    .where(
      and(
        eq(clients.accountId, clientAccountId),
        eq(clients.id, clientId),
        eq(trainerClients.status, 'active'),
      ),
    )
    .limit(1);
  return row ?? null;
},
```

- [ ] **Step 4: Расширить service.resolveScope**

```ts
resolveScope(clientAccountId: string, targetClientId?: string): Promise<ClientLink> {
  if (targetClientId) return repo.findScopeByAccountAndClient(clientAccountId, targetClientId);
  return repo.findScopeByAccountId(clientAccountId);
},
```

- [ ] **Step 5: Запустить itest — убедиться, что проходит**

Run: `npx vitest run apps/api/src/modules/client-auth/client-auth.repo.itest.ts -t "findScopeByAccountAndClient"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/client-auth/client-auth.repo.ts apps/api/src/modules/client-auth/client-auth.service.ts apps/api/src/modules/client-auth/client-auth.repo.itest.ts
git commit -m "feat(client-scope): резолвер привязки по (accountId, clientId)"
```

---

### Task 2: `makeClientScope` читает заголовок X-Client-Scope

**Files:**

- Modify: `apps/api/src/core/client-scope.ts`
- Test: `apps/api/src/core/client-scope.test.ts` (создать)

**Interfaces:**

- Consumes: `ResolveScope` (Task 1) расширяется до `(clientAccountId: string, targetClientId?: string) => Promise<ClientLink>`.
- Produces: `scope(req)` читает `req.headers['x-client-scope']`; при наличии передаёт его как `targetClientId`; если резолвер вернул `null` при заданном заголовке → `409 NOT_LINKED`; при отсутствии заголовка → прежний фолбэк (первый тренер), `null` → `409 NOT_LINKED`.

- [ ] **Step 1: Написать падающий unit-тест** — `apps/api/src/core/client-scope.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeClientScope } from './client-scope.js';

const link = { trainerId: 'A', clientId: 'cA' };
const req = (accountId?: string, header?: string) =>
  ({ clientAccountId: accountId, headers: header ? { 'x-client-scope': header } : {} }) as never;

describe('makeClientScope', () => {
  it('нет аккаунта → 401', async () => {
    const scope = makeClientScope(async () => link);
    await expect(scope(req(undefined))).rejects.toMatchObject({ status: 401 });
  });

  it('без заголовка → резолвер зовётся без targetClientId (первый тренер)', async () => {
    let seen: [string, string?] | null = null;
    const scope = makeClientScope(async (acc, target) => {
      seen = [acc, target];
      return link;
    });
    await expect(scope(req('acc1'))).resolves.toEqual(link);
    expect(seen).toEqual(['acc1', undefined]);
  });

  it('с заголовком → передаётся как targetClientId', async () => {
    let seen: [string, string?] | null = null;
    const scope = makeClientScope(async (acc, target) => {
      seen = [acc, target];
      return { trainerId: 'B', clientId: 'cB' };
    });
    await expect(scope(req('acc1', 'cB'))).resolves.toEqual({ trainerId: 'B', clientId: 'cB' });
    expect(seen).toEqual(['acc1', 'cB']);
  });

  it('заголовок задан, но привязки нет → 409 NOT_LINKED', async () => {
    const scope = makeClientScope(async () => null as never);
    await expect(scope(req('acc1', 'cX'))).rejects.toMatchObject({
      status: 409,
      code: 'NOT_LINKED',
    });
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `npx vitest run apps/api/src/core/client-scope.test.ts`
Expected: FAIL (заголовок игнорируется / сигнатура старая).

- [ ] **Step 3: Обновить client-scope.ts**

```ts
import type { FastifyRequest } from 'fastify';
import type { ClientLink } from '@trener/shared';
import { AppError, unauthorized } from '../errors.js';

export type ResolveScope = (
  clientAccountId: string,
  targetClientId?: string,
) => Promise<ClientLink>;
export type ClientScope = { trainerId: string; clientId: string };

// Скоуп клиента из сессии: нет аккаунта → 401. Заголовок X-Client-Scope выбирает
// конкретного тренера (по clientId); нет заголовка → первый тренер (совместимость).
// Не нашли привязку → 409 NOT_LINKED.
export function makeClientScope(resolveScope: ResolveScope) {
  return async function scope(req: FastifyRequest): Promise<ClientScope> {
    if (!req.clientAccountId) throw unauthorized('Требуется вход');
    const raw = req.headers['x-client-scope'];
    const target = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : undefined;
    const link = await resolveScope(req.clientAccountId, target);
    if (!link) throw new AppError(409, 'NOT_LINKED', 'Аккаунт не подключён к тренеру');
    return link;
  };
}
```

- [ ] **Step 4: Запустить — проходит**

Run: `npx vitest run apps/api/src/core/client-scope.test.ts`
Expected: PASS (4 теста).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/core/client-scope.ts apps/api/src/core/client-scope.test.ts
git commit -m "feat(client-scope): выбор тренера через заголовок X-Client-Scope"
```

---

### Task 3: Прокинуть targetClientId через app.ts

**Files:**

- Modify: `apps/api/src/app.ts` (все ~10 инъекций `resolveScope: (id) => clientAuthSvc.resolveScope(id)`)

**Interfaces:**

- Consumes: `clientAuthSvc.resolveScope(id, targetClientId?)` (Task 1), `ResolveScope` (Task 2).

- [ ] **Step 1: Заменить все инъекции** — во всех модулях, где стоит
      `resolveScope: (id) => clientAuthSvc.resolveScope(id),` заменить на:

```ts
resolveScope: (id, cid) => clientAuthSvc.resolveScope(id, cid),
```

Список модулей (по grep из app.ts): client-app-workouts, client-app-chat, client-app-trainer, client-app-calendar, client-app-measurements, client-app-progress-photos, client-app-exercises, client-app-packages, client-app-templates, analytics. Каждый `deps.resolveScope` типизирован как `(id: string) => Promise<ClientLink>` — обновить тип в соответствующих `*.module.ts` на `(id: string, targetClientId?: string) => Promise<ClientLink>`.

- [ ] **Step 2: Сборка** — типы совпадают во всех модулях.

Run: `cd apps/api && npm run build`
Expected: без ошибок TypeScript.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/modules/client-app-*/*.module.ts apps/api/src/modules/analytics/analytics.module.ts
git commit -m "feat(client-scope): прокинуть targetClientId во все клиентские модули"
```

---

### Task 4: `GET /api/client/trainers` — список тренеров аккаунта

**Files:**

- Modify: `packages/shared/src/client-auth.ts` (схема `clientTrainerLinkSchema`, `clientTrainersResponseSchema`)
- Modify: `apps/api/src/modules/client-app-trainer/client-app-trainer.routes.ts` (новый route)
- Modify: `apps/api/src/modules/client-app-trainer/client-app-trainer.module.ts` (проброс зависимостей)
- Create: репо-функция листинга (в `client-auth.repo.ts` или новом `client-app-trainer.repo.ts` — следовать существующему модулю)
- Test: `apps/api/src/modules/client-app-trainer/client-app-trainer.itest.ts` (или соседний itest модуля)

**Interfaces:**

- Produces (shared): `clientTrainerLinkSchema = z.object({ clientId: z.string(), trainerId: z.string(), trainerName: z.string(), avatarFileId: z.string().nullable(), unread: z.number().int(), lastMessageAt: z.string().nullable() })`; `clientTrainersResponseSchema = z.object({ trainers: z.array(clientTrainerLinkSchema) })`.
- Produces (route): `GET /api/client/trainers` → `{ trainers: ClientTrainerLink[] }`, `preHandler: requireClient` (НЕ `scope`).

- [ ] **Step 1: Добавить схемы в shared** и экспорт из `packages/shared/src/index.ts` (по образцу соседних экспортов). Сборка shared: `cd packages/shared && npm run build`.

- [ ] **Step 2: Написать падающий itest** — привязать один аккаунт к двум тренерам, дернуть эндпоинт:

```ts
it('GET /api/client/trainers → все активные привязки аккаунта', async () => {
  // seed: аккаунт acc1, тренер A (client cA), тренер B (client cB), обе active
  const res = await app.inject({
    method: 'GET',
    url: '/api/client/trainers',
    headers: { authorization: `Bearer ${clientToken}` }, // токен клиента acc1
  });
  expect(res.statusCode).toBe(200);
  const body = res.json();
  expect(body.trainers.map((t) => t.clientId).sort()).toEqual(['cA', 'cB']);
  expect(body.trainers[0]).toHaveProperty('trainerName');
  expect(body.trainers[0]).toHaveProperty('unread');
});
```

- [ ] **Step 3: Запустить — падает** (404 route not found).

Run: `npx vitest run apps/api/src/modules/client-app-trainer` (нужен trener_test)
Expected: FAIL.

- [ ] **Step 4: Реализовать репо-листинг** — метод, возвращающий массив
      `{ clientId, trainerId, trainerName, avatarFileId, unread, lastMessageAt }`:
      `clients × trainer_clients × trainers` где `clients.accountId = <acc>` и `trainer_clients.status='active'`; `unread`/`lastMessageAt` — тем же выражением, что и в существующем `clientUnread`/списке сообщений чата (см. `apps/api/src/modules/chat/chat.repo.ts` — переиспользовать формулу подсчёта непрочитанного клиентом). Сортировка: `lastMessageAt desc nulls last, createdAt asc`.

- [ ] **Step 5: Добавить route** в `client-app-trainer.routes.ts`:

```ts
typed.get(
  '/api/client/trainers',
  { preHandler: requireClient, schema: { response: { 200: clientTrainersResponseSchema } } },
  async (req) => {
    if (!req.clientAccountId) throw unauthorized('Требуется вход');
    return { trainers: await lookup.listTrainersForAccount(req.clientAccountId) };
  },
);
```

Пробросить `listTrainersForAccount` через `.module.ts` (по образцу текущих `lookup`-зависимостей модуля).

- [ ] **Step 6: Запустить itest — проходит.** Run: `npx vitest run apps/api/src/modules/client-app-trainer` → PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/client-auth.ts packages/shared/src/index.ts apps/api/src/modules/client-app-trainer/ apps/api/src/modules/client-auth/client-auth.repo.ts
git commit -m "feat(client-trainers): endpoint GET /api/client/trainers"
```

---

### Task 5: Пуши клиенту несут ?scope=<clientId>

**Files:**

- Modify: `apps/api/src/modules/chat/chat.service.ts` (строки с `url: '/chat'` / `'/notifications'`)
- Modify: места пушей по занятиям/замерам (`sessions`/`measurement-tasks` сервисы — найти по `url:` в client-направленных пушах)
- Test: `apps/api/src/modules/chat/chat.service.test.ts` (существующий или новый unit)

**Interfaces:**

- Produces: клиентские пуши содержат `url` с query `scope=<clientId>` — тем `clientId`, что уже есть в scope при отправке (карточка клиента у этого тренера).

- [ ] **Step 1: Падающий unit-тест** на формирование url:

```ts
it('пуш клиенту при сообщении несёт scope=<clientId>', async () => {
  const pushes: Array<{ url?: string }> = [];
  const svc = makeChatService(fakeRepo(), {
    notifyClient: (p) => pushes.push(p) /* адаптировать под реальную сигнатуру */,
  });
  await svc.sendMessage('trainerA', 'cB', { text: 'hi' }, 'trainer');
  expect(pushes.at(-1)?.url).toBe('/chat?scope=cB');
});
```

(Сигнатуру фейка/деп адаптировать под существующий `chat.service.test.ts`.)

- [ ] **Step 2: Запустить — падает.** Run: `npx vitest run apps/api/src/modules/chat/chat.service.test.ts` → FAIL.

- [ ] **Step 3: Обновить url** в `chat.service.ts`:
- `url: isTask ? '/notifications' : '/chat'` → `url: isTask ? \`/notifications?scope=${clientId}\` : \`/chat?scope=${clientId}\``
- прочие клиентские пуши (`url: \`/clients/${clientId}/chat\``— это пуш ТРЕНЕРУ, НЕ трогать; трогаем только пуши в сторону клиентского приложения).
Аналогично в пушах по занятиям/замерам, идущих клиенту: добавить`?scope=<clientId>`.

- [ ] **Step 4: Запустить — проходит.** Run: `npx vitest run apps/api/src/modules/chat/chat.service.test.ts` → PASS.

- [ ] **Step 5: Сборка + Commit**

```bash
cd apps/api && npm run build
git add apps/api/src/modules/chat apps/api/src/modules/sessions apps/api/src/modules/measurements
git commit -m "feat(push): клиентские пуши несут scope=<clientId>"
```

---

## Phase B — Mobile core: заголовок скоупа и провайдеры

### Task 6: ApiClient принимает scopeProvider

**Files:**

- Modify: `mobile/packages/core/lib/src/api/api_client.dart`
- Modify: `mobile/packages/core/lib/src/api/api_provider.dart`

**Interfaces:**

- Produces: `ApiClient({ required String baseUrl, required TokenProvider tokenProvider, ScopeProvider? scopeProvider, OnUnauthorized? onUnauthorized })`; интерсептор ставит `X-Client-Scope`, если `scopeProvider` задан и вернул непустую строку.
- Produces: `typedef ScopeProvider = FutureOr<String?> Function();`

- [ ] **Step 1: Добавить typedef + параметр + инъекцию заголовка** в `api_client.dart`:

```dart
typedef ScopeProvider = FutureOr<String?> Function();
// ...
ApiClient({
  required String baseUrl,
  required TokenProvider tokenProvider,
  ScopeProvider? scopeProvider,
  OnUnauthorized? onUnauthorized,
}) : _scopeProvider = scopeProvider, /* ...existing... */ {
  _dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) async {
      final String? token = await tokenProvider();
      if (token != null && token.isNotEmpty) options.headers['Authorization'] = 'Bearer $token';
      final String? scope = await _scopeProvider?.call();
      if (scope != null && scope.isNotEmpty) options.headers['X-Client-Scope'] = scope;
      handler.next(options);
    },
    onError: /* ...existing... */,
  ));
}
final ScopeProvider? _scopeProvider;
```

- [ ] **Step 2: api_provider.dart** — оставить дефолт без scope (тренер не задаёт): не менять сигнатуру `apiClientProvider`, но дать клиенту возможность переопределить (см. Task 8). Убедиться, что базовый провайдер по-прежнему компилируется.

- [ ] **Step 3: Analyze core**

Run: `cd mobile/packages/core && flutter analyze`
Expected: No issues found.

- [ ] **Step 4: Commit**

```bash
git add mobile/packages/core/lib/src/api/api_client.dart mobile/packages/core/lib/src/api/api_provider.dart
git commit -m "feat(core): ApiClient поддерживает scopeProvider (X-Client-Scope)"
```

---

### Task 7: Модель привязки + провайдер списка тренеров (client)

**Files:**

- Create: `mobile/apps/client/lib/api/client_trainers.dart`

**Interfaces:**

- Produces: `class ClientTrainerLink { final String clientId, trainerId, trainerName; final String? avatarFileId; final int unread; final DateTime? lastMessageAt; factory ClientTrainerLink.fromJson(...) }`
- Produces: `final FutureProvider<List<ClientTrainerLink>> clientTrainersProvider` → `GET /api/client/trainers`.

- [ ] **Step 1: Создать файл** `client_trainers.dart`:

```dart
import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class ClientTrainerLink {
  ClientTrainerLink({
    required this.clientId,
    required this.trainerId,
    required this.trainerName,
    required this.avatarFileId,
    required this.unread,
    required this.lastMessageAt,
  });
  final String clientId;
  final String trainerId;
  final String trainerName;
  final String? avatarFileId;
  final int unread;
  final DateTime? lastMessageAt;

  factory ClientTrainerLink.fromJson(Map<String, dynamic> j) => ClientTrainerLink(
        clientId: j['clientId'] as String,
        trainerId: j['trainerId'] as String,
        trainerName: (j['trainerName'] as String?) ?? '',
        avatarFileId: j['avatarFileId'] as String?,
        unread: (j['unread'] as num?)?.toInt() ?? 0,
        lastMessageAt: DateTime.tryParse((j['lastMessageAt'] as String?) ?? '')?.toLocal(),
      );
}

final FutureProvider<List<ClientTrainerLink>> clientTrainersProvider =
    FutureProvider<List<ClientTrainerLink>>((ref) async {
  final Map<String, dynamic> r = await ref.read(apiClientProvider).getJson('/api/client/trainers');
  return ((r['trainers'] as List<dynamic>?) ?? <dynamic>[])
      .cast<Map<String, dynamic>>()
      .map(ClientTrainerLink.fromJson)
      .toList();
});
```

- [ ] **Step 2: Analyze** — `cd mobile/apps/client && flutter analyze lib/api/client_trainers.dart` → No issues.

- [ ] **Step 3: Commit**

```bash
git add mobile/apps/client/lib/api/client_trainers.dart
git commit -m "feat(client): модель ClientTrainerLink + clientTrainersProvider"
```

---

### Task 8: activeTrainerProvider (персист) + подключение scopeProvider

**Files:**

- Create: `mobile/apps/client/lib/api/active_trainer.dart`
- Modify: `mobile/apps/client/lib/main.dart` (override `apiClientProvider` со `scopeProvider`)

**Interfaces:**

- Produces: `class ActiveTrainer { final String clientId, trainerId, name; final String? avatarFileId; }`
- Produces: `class ActiveTrainerNotifier extends Notifier<ActiveTrainer?>` с методами `set(ActiveTrainer)`, `clear()`, загрузкой из `LocalJsonStore` (ключ `client_active_trainer`).
- Produces: `final activeTrainerProvider = NotifierProvider<ActiveTrainerNotifier, ActiveTrainer?>(...)`.
- Consumes: `ScopeProvider` (Task 6), `LocalJsonStore` (ключ-значение).

- [ ] **Step 1: Создать active_trainer.dart** — Notifier c персистом в `LocalJsonStore` (по образцу других локальных флагов, напр. `dev_mode_flag.dart`): `build()` читает сохранённого; `set()` пишет и обновляет state; `clear()` удаляет. `state?.clientId` — то, что уйдёт в заголовок.

- [ ] **Step 2: Override apiClientProvider в main.dart** — в `ProviderScope.overrides` клиента добавить:

```dart
apiClientProvider.overrideWith((ref) => ApiClient(
      baseUrl: ref.read(baseUrlProvider),
      tokenProvider: () async => ref.read(sessionProvider).token,
      scopeProvider: () => ref.read(activeTrainerProvider)?.clientId,
      onUnauthorized: /* как в базовом apiClientProvider */,
    )),
```

(Сверить сигнатуру базового `apiClientProvider` в `api_provider.dart` и повторить `onUnauthorized`.)

- [ ] **Step 3: Analyze** — `cd mobile/apps/client && flutter analyze` → No issues.

- [ ] **Step 4: Commit**

```bash
git add mobile/apps/client/lib/api/active_trainer.dart mobile/apps/client/lib/main.dart
git commit -m "feat(client): activeTrainerProvider (персист) + X-Client-Scope в запросах"
```

---

## Phase C — Mobile UX: контакты, гейт, переключатель, пуши

### Task 9: Экран контактов (список тренеров)

**Files:**

- Create: `mobile/apps/client/lib/screens/contacts_screen.dart`
- Modify: `mobile/apps/client/lib/router.dart` (route `/contacts`)

**Interfaces:**

- Consumes: `clientTrainersProvider` (Task 7), `activeTrainerProvider` (Task 8).
- Produces: `ContactsScreen` — список тренеров (аватар, имя, бейдж непрочитанного, время последнего сообщения); тап → `activeTrainerProvider.notifier.set(...)` + `context.go('/home')`.

- [ ] **Step 1: Создать ContactsScreen** — `ConsumerWidget`, `ref.watch(clientTrainersProvider).when(...)`. Строка: `AuthedAvatar` (url через `clientTrainerApiProvider.avatarUrl(avatarFileId)`), имя, `unread`-бейдж (если >0), время. Тап-строка: `ref.read(activeTrainerProvider.notifier).set(ActiveTrainer(clientId, trainerId, name, avatarFileId)); context.go('/home');`. Заголовок «Тренеры». Нижний отступ под home-indicator через `SafeArea`.

- [ ] **Step 2: Route** — добавить в `router.dart`: `GoRoute(path: '/contacts', builder: (_, _) => const ContactsScreen())`.

- [ ] **Step 3: Analyze** → No issues.

- [ ] **Step 4: Commit**

```bash
git add mobile/apps/client/lib/screens/contacts_screen.dart mobile/apps/client/lib/router.dart
git commit -m "feat(client): экран контактов (выбор тренера)"
```

---

### Task 10: Гейт роутера (0 / 1 / 2+ тренеров)

**Files:**

- Modify: `mobile/apps/client/lib/router.dart` (redirect)

**Interfaces:**

- Consumes: `clientTrainersProvider` (Task 7), `activeTrainerProvider` (Task 8).
- Produces: при `authenticated` и попадании на `/home` (или дефолт после логина): если тренеров 0 → `/connect`; 1 → авто-`set` этой привязки, остаться; 2+ и активный не выбран → `/contacts`.

- [ ] **Step 1: Расширить redirect** — после блока `authenticated`, когда `clientTrainersProvider` уже загружен (`valueOrNull`):
  - `trainers.isEmpty` → `/connect` (если не там);
  - `trainers.length == 1` → если `activeTrainerProvider == null`, `set` единственного (через `ref.read(...notifier).set(...)` вне build — сделать в `refreshListenable`/отдельном слушателе, т.к. redirect не должен мутировать; вариант: авто-set в `SplashScreen`/gate-виджете, а redirect только направляет);
  - `trainers.length >= 2 && active == null` → `/contacts` (кроме случая, когда уже на `/contacts`).
    Пока список грузится (`isLoading`) — не редиректить (оставаться на splash/текущем).
    **Примечание для исполнителя:** мутацию `activeTrainerProvider` держать вне чистого `redirect` — либо в отдельном `ref.listen` внутри `routerProvider`, либо в gate-виджете splash. Redirect только читает и направляет.

- [ ] **Step 2: Проверить сценарии вручную (после сборки в Task 13):** 1 тренер → сразу home; 2 → contacts.

- [ ] **Step 3: Analyze** → No issues.

- [ ] **Step 4: Commit**

```bash
git add mobile/apps/client/lib/router.dart
git commit -m "feat(client): гейт входа по числу тренеров (0/1/2+)"
```

---

### Task 11: Переключатель тренера в шапке + сброс скоупа

**Files:**

- Modify: `mobile/apps/client/lib/screens/home_screen.dart` (шапка ~103, блок тренера)
- Modify: `mobile/apps/client/lib/main.dart` (использовать `resetUserScopedData` при смене активного тренера)

**Interfaces:**

- Consumes: `activeTrainerProvider`, `clientTrainersProvider`, `resetUserScopedData(ref, observer)` + `UserScopeObserver` (уже есть `_userScope` в client main.dart).
- Produces: тап по шапке-тренеру (когда тренеров ≥2) → `context.go('/contacts')`; при смене `activeTrainerProvider` вызывается `resetUserScopedData` (инвалидация всех data-провайдеров).

- [ ] **Step 1: Сброс при смене активного** — в `_ClientAppState.build` (main.dart), рядом с существующим `ref.listen<SessionState>`, добавить:

```dart
ref.listen<ActiveTrainer?>(activeTrainerProvider, (ActiveTrainer? prev, ActiveTrainer? next) {
  if (prev != null && prev.clientId != next?.clientId) {
    resetUserScopedData(ref, _userScope);
  }
});
```

- [ ] **Step 2: Переключатель в шапке home** — в блоке тренера (`home_screen.dart` ~103–120), когда `ref.watch(clientTrainersProvider).valueOrNull` содержит ≥2 привязки, показывать имя/аватар АКТИВНОГО тренера (из `activeTrainerProvider`) и по тапу вести на `/contacts` вместо `/trainer`. При 1 тренере — прежнее поведение (тап → `/trainer`). Опционально добавить маленькую иконку-стрелку рядом, что это переключатель.

- [ ] **Step 3: Analyze** → No issues.

- [ ] **Step 4: Commit**

```bash
git add mobile/apps/client/lib/screens/home_screen.dart mobile/apps/client/lib/main.dart
git commit -m "feat(client): переключатель тренера в шапке + сброс скоупа при смене"
```

---

### Task 12: Пуш-переход с переключением активного тренера

**Files:**

- Modify: `mobile/apps/client/lib/main.dart` (`_openFromPush`)

**Interfaces:**

- Consumes: `activeTrainerProvider`, `clientTrainersProvider`.
- Produces: `_openFromPush` разбирает `?scope=<clientId>`; если он есть и отличается от активного — `set` активного на эту привязку (данные из `clientTrainersProvider`), затем навигация на целевой путь; если `scope` не найден среди привязок → `/contacts`.

- [ ] **Step 1: Обновить \_openFromPush** — распарсить query `scope`; найти привязку в `ref.read(clientTrainersProvider).valueOrNull`; при наличии — `ref.read(activeTrainerProvider.notifier).set(...)` (что триггерит сброс скоупа из Task 11); затем `router.go(path)` по базовому пути (`/chat`, `/notifications`, `/calendar`). Если `scope` задан, но не найден среди привязок — `router.go('/contacts')`. Если `scope` нет (старый пуш) — прежнее поведение.

- [ ] **Step 2: Analyze** → No issues.

- [ ] **Step 3: Commit**

```bash
git add mobile/apps/client/lib/main.dart
git commit -m "feat(client): пуш переключает активного тренера по scope"
```

---

## Phase D — Проверка

### Task 13: Полная сборка, тесты, смоук

**Files:** —

- [ ] **Step 1: Backend build + unit**

Run:

```bash
cd apps/api && npm run build
cd ../.. && npx vitest run apps/api/src/core/client-scope.test.ts apps/api/src/modules/chat/chat.service.test.ts
```

Expected: сборка без ошибок; unit-тесты PASS.

- [ ] **Step 2: Backend itest (trener_test)** — прогнать itest-ы client-auth + client-app-trainer против `trener_test`.

Run: `npx vitest run apps/api/src/modules/client-auth apps/api/src/modules/client-app-trainer` (с настроенной БД `trener_test`)
Expected: PASS.

- [ ] **Step 3: Mobile analyze**

Run:

```bash
cd mobile/packages/core && flutter analyze
cd ../../apps/client && flutter analyze
```

Expected: No issues found (оба).

- [ ] **Step 4: Ручной смоук (после явной просьбы о сборке на телефон)** — привязать один аккаунт к двум тренерам; проверить: вход → экран контактов; выбор тренера → home в его скоупе; чат/календарь/тренировки/прогресс/пакеты показывают данные выбранного; переключение через шапку → контакты → второй тренер → все разделы пересчитались; пуш от неактивного тренера → тап переключает активного и открывает нужный экран. Один тренер → сразу home (регресс не сломан).

- [ ] **Step 5: Commit (если остались незакоммиченные хвосты)**

```bash
git add -A && git commit -m "chore(multi-trainer): финальные правки после смоука"
```

---

## Self-Review (выполнено автором плана)

- **Покрытие спеки:** B1 (Task 4), B2 (Task 2+1+3), B3 (Task 5), B4 (Task 4 отдаёт unread; сумма на клиенте — Task 9/11); M1 (Task 8+7), M2 (Task 6+8), M3 (Task 10), M4 (Task 9), M5 (Task 11), M6 (Task 12); граничные случаи — фолбэк без заголовка (Task 2), чужой clientId → 409 (Task 2), отвязка/пропавший активный → /contacts (Task 10/12). Всё покрыто.
- **Плейсхолдеры:** код приведён для новых/критичных единиц; для повторяющихся мест (репо-формула unread, onUnauthorized) даны точные ссылки на существующий код-образец — исполнитель копирует из указанного файла.
- **Согласованность типов:** `resolveScope(id, targetClientId?)`, `ResolveScope`, `findScopeByAccountAndClient`, `ScopeProvider`, `ClientTrainerLink`, `ActiveTrainer.clientId`, заголовок `X-Client-Scope` — имена совпадают между задачами.
