# Фото-аватары тренера и клиента — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Тренер и клиент-аккаунт загружают своё фото (сжатие на клиенте); клиент видит фото тренера на карточке. Файл обобщён: принадлежит тренеру ИЛИ аккаунту.

**Architecture:** Миграция (`files.trainer_id` nullable + `files.account_id`; `trainers.avatar_file_id`). Загрузка по образцу существующего аватара клиента (`clients.service.setAvatar`). Сжатие — браузерный `compressImage` (canvas). Узкие роуты раздачи клиенту.

**Tech Stack:** Fastify 5 + Drizzle + Postgres; React 18 + Vite; Zod (`@trener/shared`).

**Спека:** `docs/superpowers/specs/2026-06-04-avatars-trainer-and-client-design.md`.

**Образцы для переиспользования (читать перед реализацией):**

- Аватар клиента: `apps/api/src/modules/clients/clients.service.ts` (`setAvatar`/`removeAvatar`), `clients.routes.ts` (парсинг multipart `photo`, лимит), `apps/web/src/api/clients.ts` (`uploadClientAvatar`).
- Файлы: `apps/api/src/modules/files/{files.repo.ts,files.routes.ts,files.module.ts}`, `apps/api/src/files/storage.ts`.
- Фасад клиента: `apps/api/src/modules/client-app-trainer/`, `core/client-scope.ts`.

---

## Соглашения

- `*.itest.ts` — только `trener_test` (контроллер). Сабагент: `npm run typecheck`, unit, и **обязательно** `npm run build -w @trener/web` и `-w @trener/web-client` перед сдачей фронта.
- Миграцию генерит/применяет контроллер (не сабагент).
- Conventional Commits, без `--no-verify`; subject не с заглавной аббревиатуры.
- Правило цвета: красного текста-статуса не вводить.

---

## Task 1: Схема + обобщение `files` (repo/storage/раздача) + контракты

**Files:** `apps/api/src/db/schema.ts`, `apps/api/src/modules/files/files.repo.ts`, `apps/api/src/files/storage.ts`, `apps/api/src/modules/files/files.routes.ts`, `apps/api/src/modules/files/files.module.ts`, `packages/shared/src/auth.ts`.

- [ ] **Step 1: Схема.** В `schema.ts`:
  - `files.trainerId`: убрать `.notNull()` (оставить `.references(() => trainers.id, { onDelete: 'cascade' })`).
  - В `files` добавить `accountId: text('account_id').references((): AnyPgColumn => clientAccounts.id, { onDelete: 'cascade' })` (nullable). (Проверить, что `AnyPgColumn` уже импортируется — он используется для `clientAccounts.avatarFileId`.)
  - В `trainers` добавить `avatarFileId: text('avatar_file_id').references((): AnyPgColumn => files.id, { onDelete: 'set null' })` (nullable). Разместить после `contacts`.

- [ ] **Step 2: Миграция (контроллер).** `npm run db:generate -w apps/api` → должно дать ALTER: `files.trainer_id` DROP NOT NULL, ADD `account_id` + FK, `trainers` ADD `avatar_file_id` + FK. Применить к `trener` и `trener_test`.

- [ ] **Step 3: files.repo — обобщить владение.**
  - `FileRow.trainerId: string | null`; `FileRow` += `accountId: string | null`.
  - `CreateFileInput.trainerId: string | null`; += `accountId: string | null`. В `create(...).values` добавить `accountId: input.accountId`.
  - `columns` += `accountId: files.accountId`.
  - Добавить методы:
    ```ts
    async getForAccount(accountId: string, id: string): Promise<FileRow | null> {
      const [row] = await db
        .select(columns)
        .from(files)
        .where(and(eq(files.id, id), eq(files.accountId, accountId)));
      return row ?? null;
    },
    async getById(id: string): Promise<FileRow | null> {
      const [row] = await db.select(columns).from(files).where(eq(files.id, id));
      return row ?? null;
    },
    async deleteById(id: string): Promise<FileRow | null> {
      const [row] = await db.delete(files).where(eq(files.id, id)).returning(columns);
      return row ?? null;
    },
    ```
    (`getById`/`deleteById` нужны для аватара тренера/аккаунта, где владение проверяется вызывающим по avatarFileId. `getForTrainer`/`delete(trainerId)` — оставить как есть для существующих модулей.)

- [ ] **Step 4: storage — путь для файлов аккаунта.** `storage.save(trainerId, clientId, …)` оставить сигнатуру; для файлов аккаунта вызывающий передаёт `save(`acct*${accountId}`, null, fileId, ext, data)` → путь `acct*<id>/\_/<file>`. Менять storage не нужно.

- [ ] **Step 5: files.routes — раздача тренеру без изменений** (остаётся `getForTrainer`, скоуп по trainerId; файлы с trainerId=null/accountId тренеру не отдаются — `getForTrainer` их уже не найдёт). Проверить, что тип `FileReadPort.getForTrainer` совместим (trainerId по-прежнему string на входе).

- [ ] **Step 6: Контракт.** В `packages/shared/src/auth.ts` `trainerPublicResponseSchema` += `avatarFileId: z.string().nullable()`. Убедиться, что `trainerResponseSchema` (тренерский «me») содержит `avatarFileId` — если нет, добавить `avatarFileId: z.string().nullable()`.

- [ ] **Step 7:** `npm run typecheck -w apps/api && npm run build -w @trener/shared`. Commit: `feat(api): обобщить владение files (account_id) + trainers.avatar_file_id`.

---

## Task 2: Аватар тренера (API)

**Files:** `apps/api/src/modules/auth/*` (service/repo/routes/module — уточнить по факту), `apps/api/src/modules/auth/auth.module.ts`.

Контекст: тренерский «me»/профиль — модуль `auth` (`/api/auth/...`). Загрузка/удаление — по образцу `clients.service.setAvatar`/`removeAvatar` (mime-проверка, `storage.save(trainerId, null, …)`, `filesRepo.create({trainerId, accountId:null,…})`, обновить `trainers.avatarFileId`, удалить прежний файл best-effort). Парсинг multipart `photo` + лимит размера — по образцу `clients.routes.ts` (вынести/повторить читалку).

- [ ] **Step 1: Repo тренера** — методы `setAvatar(trainerId, fileId|null): Promise<{previousFileId: string|null}>` (обновляет `trainers.avatarFileId`, возвращает прежний) и чтение `avatarFileId` (для раздачи). Если тренерский repo — в `auth` модуле, добавить туда; иначе в соответствующий trainers-repo.

- [ ] **Step 2: Service** — `setAvatar(trainerId, {fileBuffer, mime, originalName})` и `removeAvatar(trainerId)` (зеркало `clients.service`, но владелец — тренер; `filesRepo.delete(trainerId, prevId)` для чистки прежнего, т.к. файл тренерский).

- [ ] **Step 3: Routes** — `POST /api/auth/me/avatar` (requireAuth, multipart) и `DELETE /api/auth/me/avatar`. Лимит размера как у `clients` аватара. «me»-ответ (`GET /api/auth/me` или эквивалент) возвращает `avatarFileId`.

- [ ] **Step 4:** Unit-тест сервиса (set/remove, удаление прежнего). `npm run typecheck -w apps/api`. Commit: `feat(api): загрузка/удаление аватара тренера`.

---

## Task 3: Аватар клиент-аккаунта (API) + раздача аватара тренера клиенту

**Files:** `apps/api/src/modules/client-auth/*`, `apps/api/src/modules/client-app-trainer/*`.

- [ ] **Step 1: client-auth repo** — `setAvatar(accountId, fileId|null): Promise<{previousFileId: string|null}>` на `client_accounts.avatarFileId` (поле уже есть). Чтение `avatarFileId` аккаунта.

- [ ] **Step 2: client-auth service** — `setAvatar(accountId, {fileBuffer, mime, originalName})`: `storage.save('acct_'+accountId, null, fileId, ext, buf)`, `filesRepo.create({trainerId:null, accountId, clientId:null, …})`, `repo.setAvatar(accountId, fileId)`, удалить прежний (`filesRepo.deleteById(prevId)` + `storage.remove`). `removeAvatar(accountId)` — симметрично. Нужен доступ к `filesRepo` и `storage` в client-auth модуле (прокинуть в `registerClientAuthModule`/сервис — в `app.ts` добавить `storage` в deps client-auth, если ещё нет).

- [ ] **Step 3: client-auth routes** — `POST /api/client/auth/me/avatar` (requireClient, multipart `photo`, лимит) ; `DELETE /api/client/auth/me/avatar`; `GET /api/client/auth/me/avatar` → стрим файла `client_accounts.avatarFileId` текущего аккаунта (`filesRepo.getById` + проверка `accountId === req.clientAccountId`; 404 если нет). Клиентский «me» (`/api/client/auth/me`) уже содержит `avatarFileId` (есть в `client-auth.service` маппинге).

- [ ] **Step 4: Раздача аватара тренера клиенту.** В `client-app-trainer`:
  - Публичный профиль (`GET /api/client/trainer`) += `avatarFileId` (из `trainers.avatarFileId`; уже резолвится тренер по id — добавить поле в выборку и ответ).
  - `GET /api/client/trainer/avatar` (requireClient → `makeClientScope` → trainerId) → найти `trainers.avatarFileId` → `filesRepo.getById` → стрим; 404 если нет фото; 409 если не привязан (через scope). Нужен `filesRepo` + `storage` в модуле `client-app-trainer` (прокинуть в `app.ts`).

- [ ] **Step 5: Isolation itest (контроллер, trener_test)** `client-avatars.isolation.itest.ts` (новый или в client-app-trainer):
  - тренер POST аватар → `GET /api/files/:id` отдаёт (200), чужой тренер → 404;
  - клиент POST `/api/client/auth/me/avatar` → `GET /api/client/auth/me/avatar` 200; без `client_sid` → 401;
  - `GET /api/client/trainer/avatar`: до привязки 409; после привязки и загрузки тренером — 200; без фото — 404.
    (Загрузку в itest делать multipart — собрать тело через `form-data`/`FormData`; mime image/png, маленький буфер.)

- [ ] **Step 6:** `npm run typecheck -w apps/api`. Commit: `feat(api): аватар клиент-аккаунта + раздача аватара тренера клиенту`.

---

## Task 4: Фронтенд — сжатие + загрузка + показ (оба приложения)

**Files:** `apps/web/src/lib/image.ts`, `apps/web-client/src/lib/image.ts` (новые); `apps/web/src/api/*`, `apps/web-client/src/api/{auth,trainer}.ts`; `apps/web/src/pages/ProfilePage.tsx`, `apps/web-client/src/pages/ProfilePage.tsx`, `apps/web-client/src/pages/TrainerPage.tsx`; возможно `apps/web/src/components/Avatar.tsx`.

- [ ] **Step 1: `compressImage` (общий код, копия в обоих `lib/image.ts`).**

  ```ts
  /** Сжать изображение на клиенте: даунскейл до maxSize по большей стороне + JPEG.
   * Возвращает Blob (image/jpeg). Оригинал не сохраняется. */
  export async function compressImage(
    file: File,
    opts: { maxSize?: number; quality?: number } = {},
  ): Promise<Blob> {
    const maxSize = opts.maxSize ?? 512;
    const quality = opts.quality ?? 0.82;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context недоступен');
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality),
    );
    if (!blob) throw new Error('не удалось сжать изображение');
    return blob;
  }
  ```

  Unit-тест (jsdom): мок `createImageBitmap` + `HTMLCanvasElement.prototype.toBlob`, проверить тип `image/jpeg` и вызов downscale. (Если canvas в jsdom не поддержан — тест помечает мок toBlob; допустимо проверить, что функция зовёт toBlob с 'image/jpeg'.)

- [ ] **Step 2: Тренер — API-хуки + ProfilePage.** `uploadMyAvatar(blob)` → multipart `photo` на `POST /api/auth/me/avatar` (по образцу `uploadClientAvatar` в `apps/web/src/api/clients.ts`); `removeMyAvatar()`. В `ProfilePage` (`apps/web`): показать фото (`/api/files/<avatarFileId>`) или инициалы; input file → `compressImage` → upload; кнопка удалить. Инвалидация «me».

- [ ] **Step 3: Клиент — API-хуки + ProfilePage.** В `apps/web-client/src/api/auth.ts`: `useUploadMyAvatar`/`useRemoveMyAvatar` (`POST/DELETE /api/client/auth/me/avatar`, multipart). В клиентском `ProfilePage`: блок аватара (фото `/api/client/auth/me/avatar` если `me.account.avatarFileId`, иначе инициалы) + загрузка (`compressImage`) + удаление. Инвалидация `useClientMe`.

- [ ] **Step 4: Клиент — фото тренера в карточке.** `apps/web-client/src/api/trainer.ts`: публичный профиль теперь несёт `avatarFileId`. В `TrainerPage`: если `t.avatarFileId` → `<img src="/api/client/trainer/avatar" className="…rounded-full object-cover">` (тот же размер 64), иначе инициалы (как сейчас). `onError` у `<img>` → фолбэк на инициалы (например, через state).

- [ ] **Step 5:** `npm run typecheck` (корень) + `npm run test -w apps/web -- image` + `npm run test -w apps/web-client` + `npm run build -w @trener/web` + `npm run build -w @trener/web-client`. Commit: `feat(web): загрузка/показ аватаров тренера и клиента (сжатие на клиенте)`.

---

## Финал

- [ ] Полный `npm run check` зелёный; сборки обоих фронтов зелёные.
- [ ] Контроллер: миграция применена (trener + trener_test); itest зелёные; пересборка docker **api + nginx(web) + web-client** (там и закоммиченные ранее тренерские доработки); live-проверка: тренер грузит фото (видно на /trainer у клиента и в тренерском профиле), клиент грузит своё фото; размер сохранённого файла мал (≤ ~100 КБ). Тестовые строки убрать.
- [ ] superpowers:finishing-a-development-branch.

## Self-review (план против спеки)

- files обобщён (trainerId nullable + accountId), trainers.avatarFileId, миграция → Task 1 ✓
- сжатие на клиенте (compressImage) → Task 4 ✓
- тренер аватар (api + ui) → Task 2,4 ✓
- клиент аватар (api + ui) → Task 3,4 ✓
- фото тренера клиенту (публичный avatarFileId + /api/client/trainer/avatar + img) → Task 3,4 ✓
- узкие клиентские роуты раздачи, /api/files/:id клиенту не открыт → Task 3 ✓
- itest изоляции/владения + регрессия существующих файлов → Task 3, Финал ✓
- лимит размера + mime на сервере → Task 2,3 (по образцу clients) ✓
