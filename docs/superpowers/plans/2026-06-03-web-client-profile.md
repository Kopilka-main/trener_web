# Клиентское приложение — раздел «Профиль». План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать клиенту экран «Профиль»: редактирование своих данных (имя/фамилия/дата рождения/контакты/«о себе»), статус подключения и выход. Без фото (подход A).

**Architecture:** Расширяем `client_accounts` (birthDate/contacts/bio) + `PATCH /api/client/auth/me`. Фронт `apps/web-client` — экран профиля с формой, статусом подключения и логаутом (логаут переезжает с экрана подключения).

**Tech Stack:** Fastify 5, Drizzle, Postgres, Zod (`@trener/shared`), React 18, Vite, TanStack Query, vitest.

**Спека:** [docs/superpowers/specs/2026-06-03-web-client-profile-design.md](../specs/2026-06-03-web-client-profile-design.md)

**Соглашения:** команды из корня репо. Бэкенд itest требует Postgres + `DATABASE_URL` (локально docker :5432) — без него `*.itest.ts` скипаются (норма для имплементера; прогон с БД делает контроллер). Docker/миграции имплементер не запускает (миграцию генерирует, но НЕ применяет). Pre-commit гоняет eslint+prettier.

**Порядок задач намеренный** — каждый коммит оставляет typecheck/тесты зелёными (контракт-ответ и его маппинг меняются в одной задаче).

---

## Карта файлов

**Бэкенд**

- Modify: `apps/api/src/db/schema.ts` — `client_accounts` += birthDate, contacts, bio.
- Create: `apps/api/drizzle/00XX_*.sql` (+ meta) — миграция (генерится).
- Modify: `packages/shared/src/client-auth.ts` — contactSchema, расширение `clientAccountResponseSchema`, новый `updateClientAccountRequestSchema`.
- Modify: `apps/api/src/modules/client-auth/client-auth.repo.ts` — `updateAccount`.
- Modify: `apps/api/src/modules/client-auth/client-auth.service.ts` — `toAccountResponse` (+поля), `updateMe`.
- Modify: `apps/api/src/modules/client-auth/client-auth.routes.ts` — `PATCH /api/client/auth/me`.
- Modify/Create tests: `client-auth.service.test.ts`, `client-auth.repo.itest.ts`, `client-auth.isolation.itest.ts`.

**Фронт `apps/web-client`**

- Modify: `src/api/auth.ts` — `useUpdateClientProfile`.
- Create: `src/pages/ProfilePage.tsx` (+ `ProfilePage.test.tsx`).
- Modify: `src/App.tsx` — `/profile` → ProfilePage.
- Modify: `src/pages/ConnectPage.tsx` — убрать «Выйти».
- Modify: `src/App.test.tsx` — без изменений по логике (логаут-мок остаётся; проверки баннера/нав не трогаем).

---

## Phase 1 — Данные

### Task 1: Миграция `client_accounts` (birthDate, contacts, bio)

**Files:**

- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/00XX_*.sql` (+ snapshot/journal)

- [ ] **Step 1: Добавить колонки в схему**

В `apps/api/src/db/schema.ts`, в определении таблицы `clientAccounts`, добавить три поля ПОСЛЕ `lastName` и ПЕРЕД `avatarFileId` (типы `text`, `jsonb`, `timestamp` уже импортированы вверху файла):

```ts
    birthDate: text('birth_date'),
    contacts: jsonb('contacts').$type<{ type: string; value: string }[]>().notNull().default([]),
    bio: text('bio'),
```

- [ ] **Step 2: Сгенерировать миграцию**

Run: `npm run db:generate -w @trener/api`
Expected: новый файл `apps/api/drizzle/00XX_*.sql` с `ALTER TABLE "client_accounts" ADD COLUMN "birth_date" text;`, `... ADD COLUMN "contacts" jsonb DEFAULT '[]'::jsonb NOT NULL;`, `... ADD COLUMN "bio" text;` + обновлён `_journal.json` и снапшот. (Генерация без БД.)

- [ ] **Step 3: Проверить миграцию + типы**

Read новый `.sql` — убедиться, что 3 ADD COLUMN присутствуют. Run: `npm run typecheck` — без ошибок.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/drizzle
git commit -m "feat(api): client_accounts — birthDate, contacts, bio"
```

(Применение миграции — контроллер. НЕ запускать `db:migrate`/docker.)

---

## Phase 2 — Контракты + бэкенд

### Task 2: Repo `updateAccount` + repo itest

**Files:**

- Modify: `apps/api/src/modules/client-auth/client-auth.repo.ts`
- Modify: `apps/api/src/modules/client-auth/client-auth.repo.itest.ts`

- [ ] **Step 1: Добавить падающий itest**

В `apps/api/src/modules/client-auth/client-auth.repo.itest.ts`, ВНУТРИ существующего `describe.skipIf(!url)(...)`, добавить тест (репо уже создаёт аккаунт `ca1` в первом тесте; добавляем новый кейс):

```ts
it('updateAccount меняет профильные поля', async () => {
  await repo.createAccount({
    id: 'ca-upd',
    email: 'upd@b.co',
    passwordHash: 'h',
    firstName: 'Имя',
    lastName: 'Фам',
  });
  const updated = await repo.updateAccount('ca-upd', {
    firstName: 'Новое',
    birthDate: '1990-05-20',
    contacts: [{ type: 'Телефон', value: '+7900' }],
    bio: 'Цель — присед 100',
  });
  expect(updated?.firstName).toBe('Новое');
  expect(updated?.birthDate).toBe('1990-05-20');
  expect(updated?.contacts).toEqual([{ type: 'Телефон', value: '+7900' }]);
  expect(updated?.bio).toBe('Цель — присед 100');
});
```

- [ ] **Step 2: Запустить — упасть**

PowerShell:

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/trener'; npm run test -- client-auth.repo
```

Expected: FAIL — `repo.updateAccount is not a function` (или skipped без БД — тогда имплементер переходит к реализации).

- [ ] **Step 3: Реализовать `updateAccount`**

В `apps/api/src/modules/client-auth/client-auth.repo.ts` добавить метод в возвращаемый объект (рядом с `findAccountById`), используя уже импортированные `clientAccounts`, `eq`:

```ts
    async updateAccount(
      id: string,
      patch: {
        firstName?: string;
        lastName?: string;
        birthDate?: string | null;
        contacts?: { type: string; value: string }[];
        bio?: string | null;
      },
    ) {
      if (Object.keys(patch).length === 0) {
        const [row] = await db.select().from(clientAccounts).where(eq(clientAccounts.id, id));
        return row ?? null;
      }
      const [row] = await db
        .update(clientAccounts)
        .set(patch)
        .where(eq(clientAccounts.id, id))
        .returning();
      return row ?? null;
    },
```

- [ ] **Step 4: Запустить — пройти**

PowerShell:

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/trener'; npm run test -- client-auth.repo
```

Expected: PASS. `npm run typecheck` — чисто.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/client-auth/client-auth.repo.ts apps/api/src/modules/client-auth/client-auth.repo.itest.ts
git commit -m "feat(api): client-auth repo updateAccount"
```

---

### Task 3: Контракты + сервис `updateMe` (вместе — серилизация ответа консистентна)

**Files:**

- Modify: `packages/shared/src/client-auth.ts`
- Modify: `apps/api/src/modules/client-auth/client-auth.service.ts`
- Modify: `apps/api/src/modules/client-auth/client-auth.service.test.ts`

- [ ] **Step 1: Падающий unit-тест сервиса**

В `apps/api/src/modules/client-auth/client-auth.service.test.ts` обновить `fakeRepo` (добавить `updateAccount`) и добавить тест. В функции `fakeRepo`, в объект добавить:

```ts
    updateAccount: vi.fn((id: string, patch: Record<string, unknown>) =>
      Promise.resolve({
        id,
        email: 'a@b.co',
        firstName: 'И',
        lastName: 'К',
        avatarFileId: null,
        birthDate: null,
        contacts: [],
        bio: null,
        ...patch,
      }),
    ),
```

И добавить тест в `describe('client-auth.service', ...)`:

```ts
it('updateMe передаёт только определённые поля и возвращает профиль', async () => {
  const updateAccount = vi.fn((id: string, patch: Record<string, unknown>) =>
    Promise.resolve({
      id,
      email: 'a@b.co',
      firstName: 'И',
      lastName: 'К',
      avatarFileId: null,
      birthDate: null,
      contacts: [],
      bio: null,
      ...patch,
    }),
  );
  const repo = fakeRepo({ updateAccount });
  const svc = makeClientAuthService(repo, { newId: () => 'id', now: () => new Date(0) });
  const res = await svc.updateMe('ca1', { firstName: 'Новое', bio: 'цель' });
  expect(updateAccount).toHaveBeenCalledWith('ca1', { firstName: 'Новое', bio: 'цель' });
  expect(res.firstName).toBe('Новое');
  expect(res.bio).toBe('цель');
});
```

- [ ] **Step 2: Запустить — упасть**

Run: `npm run test -- client-auth.service`
Expected: FAIL — `svc.updateMe is not a function` (+ возможна ошибка типов до правки контрактов).

- [ ] **Step 3: Расширить контракты**

В `packages/shared/src/client-auth.ts`:

(а) добавить вверху (после `const email = ...`):

```ts
const contactSchema = z.object({
  type: z.string().trim().min(1).max(40),
  value: z.string().trim().min(1).max(200),
});
```

(б) заменить `clientAccountResponseSchema` на расширенный:

```ts
export const clientAccountResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  avatarFileId: z.string().nullable(),
  birthDate: z.string().nullable(),
  contacts: z.array(contactSchema),
  bio: z.string().nullable(),
});
export type ClientAccountResponse = z.infer<typeof clientAccountResponseSchema>;
```

(в) добавить запрос обновления (после `clientLoginRequestSchema`):

```ts
export const updateClientAccountRequestSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Дата в формате ГГГГ-ММ-ДД')
    .nullish(),
  contacts: z.array(contactSchema).max(20).optional(),
  bio: z.string().trim().max(2000).nullish(),
});
export type UpdateClientAccountRequest = z.infer<typeof updateClientAccountRequestSchema>;
```

- [ ] **Step 4: Расширить сервис**

В `apps/api/src/modules/client-auth/client-auth.service.ts`:

(а) импорт типа: добавить `UpdateClientAccountRequest` в импорт из `@trener/shared`.

(б) заменить `toAccountResponse` на:

```ts
function toAccountResponse(a: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarFileId: string | null;
  birthDate: string | null;
  contacts: { type: string; value: string }[];
  bio: string | null;
}): ClientAccountResponse {
  return {
    id: a.id,
    email: a.email,
    firstName: a.firstName,
    lastName: a.lastName,
    avatarFileId: a.avatarFileId,
    birthDate: a.birthDate,
    contacts: a.contacts ?? [],
    bio: a.bio,
  };
}
```

(в) добавить метод `updateMe` в возвращаемый объект (после `me`):

```ts
    async updateMe(
      clientAccountId: string,
      input: UpdateClientAccountRequest,
    ): Promise<ClientAccountResponse> {
      const patch: {
        firstName?: string;
        lastName?: string;
        birthDate?: string | null;
        contacts?: { type: string; value: string }[];
        bio?: string | null;
      } = {};
      if (input.firstName !== undefined) patch.firstName = input.firstName;
      if (input.lastName !== undefined) patch.lastName = input.lastName;
      if (input.birthDate !== undefined) patch.birthDate = input.birthDate ?? null;
      if (input.contacts !== undefined) patch.contacts = input.contacts;
      if (input.bio !== undefined) patch.bio = input.bio ?? null;
      const account = await repo.updateAccount(clientAccountId, patch);
      if (!account) throw unauthorized('Сессия недействительна');
      return toAccountResponse(account);
    },
```

- [ ] **Step 5: Сборка shared + тесты + типы**

Run: `npm run build -w @trener/shared` (нужно для api/web типов).
Run: `npm run test -- client-auth.service` → PASS.
Run: `npm run typecheck` → чисто. (Проверка: `me`/login/register всё ещё отдают валидный `account` — `toAccountResponse` теперь включает новые поля, а строки из repo их содержат после миграции.)

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/client-auth.ts apps/api/src/modules/client-auth/client-auth.service.ts apps/api/src/modules/client-auth/client-auth.service.test.ts
git commit -m "feat(api,shared): профиль клиента — контракты + сервис updateMe"
```

---

### Task 4: Роут `PATCH /api/client/auth/me` + isolation itest

**Files:**

- Modify: `apps/api/src/modules/client-auth/client-auth.routes.ts`
- Modify: `apps/api/src/modules/client-auth/client-auth.isolation.itest.ts`

- [ ] **Step 1: Падающий itest**

В `apps/api/src/modules/client-auth/client-auth.isolation.itest.ts`, ВНУТРИ существующего `describe.skipIf(!url)(...)`, добавить тест. В файле уже есть хелпер `clientSidFrom(res)` (возвращает ЗНАЧЕНИЕ cookie) и используется через `cookies: { client_sid: sid }` — следуем этому паттерну:

```ts
it('PATCH /me обновляет профиль; без сессии → 401', async () => {
  const reg = await app.inject({
    method: 'POST',
    url: '/api/client/auth/register',
    payload: { email: 'prof@b.co', password: 'longenough1', firstName: 'И', lastName: 'К' },
  });
  const sid = clientSidFrom(reg);
  const patch = await app.inject({
    method: 'PATCH',
    url: '/api/client/auth/me',
    cookies: { client_sid: sid },
    payload: { firstName: 'Пётр', birthDate: '1992-03-10', bio: 'Набрать массу' },
  });
  expect(patch.statusCode).toBe(200);
  const me = await app.inject({
    method: 'GET',
    url: '/api/client/auth/me',
    cookies: { client_sid: sid },
  });
  const body = me.json<{
    account: { firstName: string; birthDate: string | null; bio: string | null };
  }>();
  expect(body.account.firstName).toBe('Пётр');
  expect(body.account.birthDate).toBe('1992-03-10');
  expect(body.account.bio).toBe('Набрать массу');

  const noAuth = await app.inject({
    method: 'PATCH',
    url: '/api/client/auth/me',
    payload: { firstName: 'X' },
  });
  expect(noAuth.statusCode).toBe(401);
});
```

- [ ] **Step 2: Запустить — упасть**

PowerShell:

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/trener'; npm run test -- client-auth.isolation
```

Expected: FAIL — PATCH → 404 (роут не существует). Без БД — skipped.

- [ ] **Step 3: Реализовать роут**

В `apps/api/src/modules/client-auth/client-auth.routes.ts`:

(а) импорт: добавить `updateClientAccountRequestSchema` в импорт из `@trener/shared` и `clientAccountResponseSchema` уже импортирован.

(б) добавить роут после `typed.get('/api/client/auth/me', ...)`:

```ts
typed.patch(
  '/api/client/auth/me',
  {
    schema: {
      body: updateClientAccountRequestSchema,
      response: { 200: z.object({ account: clientAccountResponseSchema }) },
    },
  },
  async (req) => {
    if (!req.clientAccountId) throw unauthorized('Требуется вход');
    return { account: await svc.updateMe(req.clientAccountId, req.body) };
  },
);
```

(`z`, `unauthorized`, `svc` уже в файле; `clientAccountResponseSchema` — добавить в импорт, если не было.)

- [ ] **Step 4: Запустить — пройти + типы**

PowerShell:

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/trener'; npm run test -- client-auth.isolation
```

Expected: PASS. `npm run typecheck` — чисто.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/client-auth/client-auth.routes.ts apps/api/src/modules/client-auth/client-auth.isolation.itest.ts
git commit -m "feat(api): PATCH /api/client/auth/me — обновление профиля клиента"
```

---

## Phase 3 — Фронт

### Task 5: API-хук обновления профиля

**Files:**

- Modify: `apps/web-client/src/api/auth.ts`

- [ ] **Step 1: Добавить хук**

В `apps/web-client/src/api/auth.ts`:

(а) в импорт из `@trener/shared` добавить `type UpdateClientAccountRequest`.

(б) добавить хук в конец файла:

```ts
export function useUpdateClientProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateClientAccountRequest) =>
      apiFetch('/client/auth/me', { method: 'PATCH', body: input, schema: accountEnvelope }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientMeQueryKey });
    },
  });
}
```

(`accountEnvelope`, `clientMeQueryKey`, `apiFetch`, `useMutation`, `useQueryClient` уже в файле.)

- [ ] **Step 2: Типы**

Run: `npx tsc --noEmit -p apps/web-client/tsconfig.app.json`
Expected: чисто (ProfilePage ещё нет — он в следующей задаче, но App пока его не импортирует).

- [ ] **Step 3: Commit**

```bash
git add apps/web-client/src/api/auth.ts
git commit -m "feat(web-client): хук обновления профиля"
```

---

### Task 6: Экран «Профиль» + маршрут + smoke

**Files:**

- Create: `apps/web-client/src/pages/ProfilePage.tsx`
- Create: `apps/web-client/src/pages/ProfilePage.test.tsx`
- Modify: `apps/web-client/src/App.tsx`

- [ ] **Step 1: Реализовать ProfilePage**

Create `apps/web-client/src/pages/ProfilePage.tsx`:

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import type { ClientAccountResponse } from '@trener/shared';
import { useClientMe, useClientLogout, useUpdateClientProfile } from '../api/auth';

const CONTACT_TYPES = ['Телефон', 'WhatsApp', 'Telegram', 'MAX', 'Instagram', 'Прочее'] as const;
type Contact = { type: string; value: string };

export function ProfilePage() {
  const me = useClientMe();
  const logout = useClientLogout();
  const update = useUpdateClientProfile();

  return (
    <div className="flex flex-1 flex-col gap-5 px-4 pb-6 pt-5">
      <h1 className="font-[family-name:var(--font-display)] text-[28px] text-ink">Профиль</h1>
      {me.data ? (
        <ProfileForm account={me.data.account} linked={me.data.link !== null} update={update} />
      ) : (
        <p className="text-sm text-ink-muted">Загрузка…</p>
      )}
      <button
        type="button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className="mt-2 rounded-xl bg-card py-3 text-[14px] font-semibold text-ink active:bg-card-elevated disabled:opacity-60"
      >
        Выйти
      </button>
    </div>
  );
}

function ProfileForm({
  account,
  linked,
  update,
}: {
  account: ClientAccountResponse;
  linked: boolean;
  update: ReturnType<typeof useUpdateClientProfile>;
}) {
  const [firstName, setFirstName] = useState(account.firstName);
  const [lastName, setLastName] = useState(account.lastName);
  const [birthDate, setBirthDate] = useState(account.birthDate ?? '');
  const [bio, setBio] = useState(account.bio ?? '');
  const [contacts, setContacts] = useState<Contact[]>(account.contacts);
  const [saved, setSaved] = useState(false);

  // Подтянуть значения, когда me догрузился/обновился.
  useEffect(() => {
    setFirstName(account.firstName);
    setLastName(account.lastName);
    setBirthDate(account.birthDate ?? '');
    setBio(account.bio ?? '');
    setContacts(account.contacts);
  }, [account]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(false);
    update.mutate(
      {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthDate: birthDate === '' ? null : birthDate,
        bio: bio.trim() === '' ? null : bio.trim(),
        contacts: contacts
          .filter((c) => c.value.trim() !== '')
          .map((c) => ({ type: c.type, value: c.value.trim() })),
      },
      { onSuccess: () => setSaved(true) },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Статус подключения */}
      {linked ? (
        <p className="rounded-xl bg-card px-4 py-3 text-[13px] text-ink-muted">
          Вы подключены к тренеру.
        </p>
      ) : (
        <Link
          to="/connect"
          className="rounded-xl bg-card px-4 py-3 text-[14px] font-semibold text-accent active:bg-card-elevated"
        >
          Подключить тренера
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-muted">Имя</span>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="rounded-xl border border-line bg-chip px-3 py-2.5 text-base text-ink outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-muted">Фамилия</span>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="rounded-xl border border-line bg-chip px-3 py-2.5 text-base text-ink outline-none focus:border-accent"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-muted">Дата рождения</span>
        <input
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          className="rounded-xl border border-line bg-chip px-3 py-2.5 text-base text-ink outline-none focus:border-accent"
        />
      </label>

      {/* Контакты */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-ink-muted">Контакты</span>
        {contacts.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              value={c.type}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)),
                )
              }
              className="rounded-xl border border-line bg-chip px-2 py-2.5 text-sm text-ink outline-none focus:border-accent"
            >
              {CONTACT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              value={c.value}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                )
              }
              className="min-w-0 flex-1 rounded-xl border border-line bg-chip px-3 py-2.5 text-base text-ink outline-none focus:border-accent"
            />
            <button
              type="button"
              aria-label="Удалить контакт"
              onClick={() => setContacts((prev) => prev.filter((_, j) => j !== i))}
              className="shrink-0 rounded-xl bg-card p-2.5 text-ink-muted active:bg-card-elevated"
            >
              <X size={16} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setContacts((prev) => [...prev, { type: 'Телефон', value: '' }])}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2.5 text-[13px] font-semibold text-ink-muted active:border-accent"
        >
          <Plus size={16} /> Добавить контакт
        </button>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-muted">О себе / цели</span>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={4}
          className="rounded-xl border border-line bg-chip px-3 py-2.5 text-base text-ink outline-none focus:border-accent"
        />
      </label>

      {update.isError && (
        <p className="text-sm text-ink-muted" role="alert">
          Не удалось сохранить. Попробуйте снова.
        </p>
      )}
      {saved && !update.isPending && (
        <p className="text-sm text-ink-muted" role="status">
          Сохранено.
        </p>
      )}

      <button
        type="submit"
        disabled={update.isPending}
        className="rounded-xl bg-accent py-3 font-semibold text-accent-on active:opacity-90 disabled:opacity-60"
      >
        {update.isPending ? 'Сохранение…' : 'Сохранить'}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Подключить маршрут**

В `apps/web-client/src/App.tsx`:
(а) импорт после `import { WorkoutDetailPage } from './pages/WorkoutDetailPage';`:

```tsx
import { ProfilePage } from './pages/ProfilePage';
```

(б) заменить строку

```tsx
<Route path="/profile" element={<StubPage title="Профиль" />} />
```

на

```tsx
<Route path="/profile" element={<ProfilePage />} />
```

- [ ] **Step 3: Smoke-тест**

Create `apps/web-client/src/pages/ProfilePage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProfilePage } from './ProfilePage';
import * as auth from '../api/auth';

vi.mock('../api/auth');

const account = {
  id: 'ca1',
  email: 'a@b.co',
  firstName: 'Иван',
  lastName: 'Петров',
  avatarFileId: null,
  birthDate: '1990-05-20',
  contacts: [{ type: 'Телефон', value: '+7900' }],
  bio: 'Цель — присед 100',
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ProfilePage />
    </MemoryRouter>,
  );
}

describe('ProfilePage', () => {
  const mutate = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(auth.useClientLogout).mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    vi.mocked(auth.useUpdateClientProfile).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as never);
  });

  it('показывает значения профиля и кнопку «Выйти»', () => {
    vi.mocked(auth.useClientMe).mockReturnValue({
      isLoading: false,
      data: { account, link: { trainerId: 't1', clientId: 'cl1' } },
    } as never);
    renderPage();
    expect(screen.getByDisplayValue('Иван')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Цель — присед 100')).toBeInTheDocument();
    expect(screen.getByText('Вы подключены к тренеру.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
  });

  it('не подключён → ссылка «Подключить тренера»', () => {
    vi.mocked(auth.useClientMe).mockReturnValue({
      isLoading: false,
      data: { account: { ...account, contacts: [] }, link: null },
    } as never);
    renderPage();
    expect(screen.getByText('Подключить тренера')).toBeInTheDocument();
  });

  it('«Сохранить» вызывает мутацию с payload', () => {
    vi.mocked(auth.useClientMe).mockReturnValue({
      isLoading: false,
      data: { account, link: null },
    } as never);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: 'Иван', bio: 'Цель — присед 100' }),
      expect.anything(),
    );
  });
});
```

- [ ] **Step 4: Тесты + сборка**

Run: `npm run test -w @trener/web-client -- ProfilePage` → PASS (3).
Run: `npm run build -w @trener/web-client` → чистая сборка.

- [ ] **Step 5: Commit**

```bash
git add apps/web-client/src/pages/ProfilePage.tsx apps/web-client/src/pages/ProfilePage.test.tsx apps/web-client/src/App.tsx
git commit -m "feat(web-client): экран профиля клиента"
```

---

### Task 7: Убрать «Выйти» с экрана подключения

**Files:**

- Modify: `apps/web-client/src/pages/ConnectPage.tsx`

- [ ] **Step 1: Удалить логаут из ConnectPage**

В `apps/web-client/src/pages/ConnectPage.tsx`:

- Удалить импорт `useClientLogout` и строку `const logout = useClientLogout();`.
- Удалить кнопку «Выйти» (весь `<button ... onClick={() => logout.mutate()} ...>Выйти</button>`).
- Оставить кнопку «Продолжить» и остальной контент.

Итоговый компонент:

```tsx
import { QRCodeSVG } from 'qrcode.react';
import { useNavigate } from 'react-router-dom';

export function ConnectPage({ code }: { code: string }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-1 flex-col justify-center gap-6 px-6 py-8 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-[28px] leading-tight text-accent">
        Подключение
      </h1>
      <p className="text-sm text-ink-muted">
        Передай этот код тренеру — он подключит тебя, и появятся назначенные тренировки. Можно
        продолжить и заниматься самостоятельно.
      </p>
      <div className="mx-auto rounded-2xl bg-ink p-4">
        <QRCodeSVG value={code} size={180} bgColor="#eeeee8" fgColor="#0b0c10" />
      </div>
      <div className="rounded-xl border border-line bg-chip px-4 py-3 font-mono text-sm break-all text-ink">
        {code}
      </div>
      <button
        type="button"
        onClick={() => void navigate('/')}
        className="rounded-xl bg-accent py-3 font-semibold text-accent-on active:opacity-90"
      >
        Продолжить
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Тесты + сборка**

Run: `npm run test -w @trener/web-client` → все зелёные (App.test использует `useClientLogout` для других экранов — ConnectPage его больше не зовёт, но мок не мешает).
Run: `npm run build -w @trener/web-client` → чисто.

- [ ] **Step 3: Commit**

```bash
git add apps/web-client/src/pages/ConnectPage.tsx
git commit -m "refactor(web-client): логаут только в профиле — убрать с экрана подключения"
```

---

## Финальная проверка

- [ ] **Гейт качества**

Run: `npm run check`
Expected: format + lint + typecheck + test зелёные (itest скипнут без БД).

- [ ] **Прогон с БД (контроллер)**

PowerShell:

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/trener'; npm run test
```

Expected: включая client-auth repo/isolation — всё зелёное.

- [ ] **Живой smoke (контроллер):** применить миграцию, пересобрать api+web-client; в `:8081` клиент открывает «Профиль», меняет имя/дату/контакты/«о себе», сохраняет; перезаход — значения на месте; «Выйти» работает; на экране подключения логаута больше нет.

---

## Self-review (выполнено при написании)

- **Покрытие спеки:** миграция client_accounts (Task 1); repo updateAccount (Task 2); контракты + сервис updateMe + toAccountResponse (Task 3); PATCH /me + 401 (Task 4); хук (Task 5); экран профиля с формой/контактами/статусом/логаутом (Task 6); перенос логаута с ConnectPage (Task 7). Фото/тренерский просмотр/пароль — вне объёма, не реализуется.
- **Зелёность на каждом шаге:** контракт-ответ расширяется одновременно с `toAccountResponse` (Task 3), поэтому register/login/me не ломают сериализацию между коммитами. Миграция (Task 1) добавляет колонки до того, как repo/сервис их читают.
- **Типы согласованы:** `UpdateClientAccountRequest`/`ClientAccountResponse` (shared) ↔ сервис ↔ хук; `updateAccount` сигнатура едина в repo, тесте, сервисе; контакты `{type,value}` везде.
- **Плейсхолдеров нет.** Отмечен момент: имя хелпера cookie в isolation-itest проверить по факту (`cookieFrom`/`clientSidFrom`).
