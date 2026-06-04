# Фото-аватары тренера и клиента — дизайн

**Дата:** 2026-06-04
**Область:** API (`files`, `auth`/`client-auth`, `client-app-trainer`) + `apps/web` (тренер) + `apps/web-client` (клиент).
**Связано:** [[project_web_client_app]]; снимает отложенный пункт «фото отложено: файлы привязаны к тренеру».

## Цель

Дать **тренеру** и **клиенту (аккаунту)** загружать своё фото профиля. Фото **сжимается на клиенте**
перед отправкой (уменьшается до небольшого размера, оригинал на сервер не попадает — «развернуть»
нельзя). Клиент видит фото своего тренера на карточке тренера; оба видят свой аватар в профиле.

## Решения (зафиксированы в брейншторме)

1. **Сжатие — на клиенте** (`<canvas>`): даунскейл до макс. 512px по большей стороне, JPEG q≈0.8.
   На сервер уходит уже маленький файл. Серверный предохранитель — лимит размера (≈400 КБ) и
   проверка mime (image/\*).
2. **Обобщение владения файлом**: `files.trainerId` → nullable; добавить `files.account_id`
   (nullable FK на `client_accounts`). Файл принадлежит **либо** тренеру, **либо** клиент-аккаунту.
3. Аватар **и у тренера, и у клиента**; показ фото тренера — клиенту на карточке.

## Архитектура

### Бэкенд

**Схема + миграция (новая, напр. 0028)**

- `files.trainerId` → **nullable** (`text('trainer_id').references(...)` без `.notNull()`).
- `files.account_id` → **nullable** FK на `client_accounts.id` (`onDelete: 'set null'` либо `cascade`).
- Инвариант (в сервисе/репо, не в БД): у файла задан ровно один владелец — `trainerId` XOR `accountId`.
- `trainers.avatarFileId` → новый nullable FK на `files.id` (`onDelete: 'set null'`).
- `client_accounts.avatarFileId` — **уже есть**, ничего не добавляем.
- ⚠️ Снятие `notNull` с `files.trainerId` затрагивает существующие репо/запросы files — все текущие
  места создания файлов (clients-аватар, progress-photos, medical) продолжают писать `trainerId`,
  поведение для них не меняется.

**Раздача файлов**

- Существующий `GET /api/files/:id` (requireAuth, тренерский скоуп) — оставить для тренерских файлов:
  скоуп по `trainerId === req.trainerId`; файлы с `accountId` тренеру не отдаются.
- Новый клиентский доступ к **своим** файлам и к **аватару тренера**:
  - `GET /api/client/auth/me/avatar` — отдаёт файл `client_accounts.avatarFileId` текущего аккаунта
    (через `requireClient`). 404, если аватара нет.
  - `GET /api/client/trainer/avatar` — через `makeClientScope` → trainerId → отдаёт файл
    `trainers.avatarFileId` привязанного тренера. 404, если нет.
    (Прямой доступ клиента к произвольным `/api/files/:id` НЕ открываем — только эти узкие роуты.)

**Загрузка/удаление аватара** (multipart `photo`, image/\*, лимит размера; пайплайн — по образцу
существующего аватара клиента в `clients.service`):

- Тренер: `POST /api/auth/me/avatar` (requireAuth) → сохранить файл (`trainerId=self`), удалить
  прежний файл, выставить `trainers.avatarFileId`; `DELETE /api/auth/me/avatar` → снять и удалить файл.
- Клиент: `POST /api/client/auth/me/avatar` (requireClient) → сохранить файл (`accountId=self`),
  удалить прежний, выставить `client_accounts.avatarFileId`; `DELETE` — симметрично.

**Контракты (`@trener/shared`)**

- Публичный профиль тренера `trainerPublicResponseSchema` += `avatarFileId: z.string().nullable()`.
- Ответ «о тренере»/«me»: тренерский `trainerResponseSchema` и клиентский `clientAccountResponseSchema`
  уже несут (или получают) `avatarFileId` — фронт строит URL аватара.

### Клиентское сжатие (общий приём в обоих фронтах)

Хелпер `compressImage(file, { maxSize: 512, quality: 0.82 }): Promise<Blob>`:

- `createImageBitmap`/`<img>` → `<canvas>` с пропорциональным даунскейлом до `maxSize`.
- `canvas.toBlob('image/jpeg', quality)`.
- Возвращает Blob; отправляется как `photo` в multipart.
- Реализуется отдельно в `apps/web/src/lib/image.ts` и `apps/web-client/src/lib/image.ts` (приложения
  не импортируют друг друга — копия, как договорено по другим утилитам).

### Тренерский фронт (`apps/web`)

- `ProfilePage`: вместо инициалов-`Avatar` — кружок с фото (если `avatarFileId`) + кнопка «Загрузить
  фото»/«Удалить». Загрузка: `compressImage` → `POST /api/auth/me/avatar`. URL — `/api/files/:id`.
- Хуки `useUploadMyAvatar`/`useRemoveMyAvatar` в `apps/web/src/api` (по образцу `useUploadClientAvatar`).

### Клиентский фронт (`apps/web-client`)

- `ProfilePage`: блок аватара (фото или инициалы) + загрузка/удаление через
  `POST/DELETE /api/client/auth/me/avatar`. URL своего аватара — `/api/client/auth/me/avatar`.
- `TrainerPage`: вместо инициалов — `<img src="/api/client/trainer/avatar">` если у тренера есть
  `avatarFileId` (из публичного профиля), иначе инициалы (фолбэк уже есть).
- Хуки в `apps/web-client/src/api/auth.ts` (свой аватар) и `trainer.ts` (флаг наличия фото тренера).

## Поток данных

1. Пользователь выбирает фото → `compressImage` → multipart `photo` → `POST .../avatar`.
2. Сервис сохраняет маленький файл (владелец = тренер или аккаунт), удаляет прежний, пишет `avatarFileId`.
3. Отображение: тренерский аватар — `/api/files/:id`; клиентский свой — `/api/client/auth/me/avatar`;
   фото тренера у клиента — `/api/client/trainer/avatar`.

## Обработка ошибок / граничные случаи

- Не-изображение или >лимита → 400/413, на фронте — сообщение, аватар не меняется.
- Нет аватара → роут раздачи 404; фронт показывает инициалы (фолбэк).
- Удаление аватара — удаляет и файл из стораджа, и ссылку.
- Без красного текста (правило проекта); «Удалить» — нейтральная кнопка/иконка-действие.

## Тестирование

- **Контракты**: новые поля схем валидируются.
- **Service (unit)**: установка/смена/удаление avatarFileId; удаление прежнего файла; владелец
  trainerId XOR accountId.
- **Isolation itest (только `trener_test`)**:
  - тренер грузит свой аватар, отдаётся по `/api/files/:id`; чужой тренер — 404;
  - клиент грузит свой аватар (`accountId`), отдаётся по `/api/client/auth/me/avatar`; без сессии — 401;
  - `/api/client/trainer/avatar` отдаёт аватар привязанного тренера; до привязки — 409; нет фото — 404;
  - регрессия: существующие clients-аватар/progress-photos/medical (файлы с trainerId) не сломаны.
- **Frontend**: `compressImage` (downscale возвращает image/jpeg Blob меньше оригинала — мок canvas);
  ProfilePage/TrainerPage показывают фото при наличии, инициалы иначе.
- `npm run check` + `npm run build` (оба фронта) зелёные.

## Вне scope

- Кадрирование/редактор фото (грузим как есть после даунскейла).
- Множественные размеры/thumbnails (один сжатый размер).
- Серверный `sharp` (решено — сжатие на клиенте).
- Миграция существующих фото прогресса/медкарт на сжатие (только аватары).

## Замечание по деплою

Тренерские доработки (чат/пакеты/уведомления) уже закоммичены, но api/nginx собраны на старом коде —
будут пересобраны вместе с этой фичей (миграция `files`/`trainers` + новые роуты).
