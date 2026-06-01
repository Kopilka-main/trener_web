# Фаза 6: Файлы — storage, progress-photos, медкарта — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Файловое хранилище (локальный диск + volume) с защищённой раздачей, плюс два доменных модуля поверх него: фото прогресса и медкарта клиента. Файлы приватны — раздаются только владельцу-тренеру через защищённый роут (НЕ static).

**Architecture:** Модуль `files` (storage core): `@fastify/multipart`, сохранение на диск в `<UPLOADS_DIR>/<trainerId>/<clientId>/<fileId>`, таблица `files` (scoped по trainerId+clientId), защищённый `GET /api/files/:id` (requireAuth + scope → стрим с диска). `progress-photos` и `medical-records` — доменные модули под клиента (`requireClientAccess`), ссылаются на `files`. Всё по эталону Фаз 3–5 (repo/service/routes/module, isolation-тесты). Только тренер.

**Tech Stack:** Fastify 5, `@fastify/multipart`, Drizzle ORM, PostgreSQL, Zod, Vitest, Node fs/streams. Всё из Фаз 1–5.

**Решения по объёму:** локальный диск + Docker volume; типы файлов — изображения (jpg/png/webp) для фото, для медкарты также pdf; лимит размера 10 МБ; защищённая раздача стримом. Эскизы/превью — позже (YAGNI).

---

## Эталоны

- Доменный модуль под клиента: `apps/api/src/modules/measurements/` (scoped trainer+client, requireClientAccess).
- env-валидация: `apps/api/src/env.ts` (добавить `UPLOADS_DIR`).
- Конвенции: ветка фазы, `core.autocrlf=false`+LF; Conventional Commits (subject нижний регистр), тело через файл БЕЗ BOM + `git commit -F`; НЕ `--no-verify`; itest skipIf без `DATABASE_URL`; `npm run check` без БД=0; type-provider на роутах; границы слоёв; clock через module.

---

## Task 0: Доработки из ревью Фазы 5 (быстрые)

- [ ] **chat addMessage в транзакцию** (`chat.repo.ts`): обернуть insert message + update lastMessageAt в `db.transaction`.
- [ ] **chat polling tie-break** (`chat.repo.ts` listMessages): курсор `(createdAt, id)` — `orderBy(asc(createdAt), asc(id))`, фильтр sinceId по `(createdAt > s.createdAt) OR (createdAt = s.createdAt AND id > s.id)`. Тест: два сообщения с равным createdAt → polling не теряет.
- [ ] **updateExpense порядок 404/ref** (`accounting.service.ts`): сперва проверить существование расхода (404), затем `assertExpenseRefs`. Тест: PATCH несуществующего → 404.
- [ ] **accounting isolation 401**: добавить в `accounting.isolation.itest.ts` кейс `GET /api/expenses` без cookie → 401.
- [ ] `npm run check` + Docker-itest зелёные. Commit `fix(api): доработки чата и бухгалтерии из ревью Фазы 5` (или несколькими).

---

## Часть A — File storage core

### Task A1: env `UPLOADS_DIR` + зависимость multipart

- [ ] В `apps/api/src/env.ts` добавить `UPLOADS_DIR: z.string().default('/data/uploads')`. В `.env.example` добавить `UPLOADS_DIR=./data/uploads` (для dev). Установить `npm install -w @trener/api @fastify/multipart`. `npm run check` → 0. Commit `chore(api): UPLOADS_DIR + @fastify/multipart`.

### Task A2: схема `files` + миграция

- [ ] Таблица `files` (`schema.ts`): id PK; trainerId notNull FK→trainers cascade; clientId text nullable FK→clients cascade; mime text notNull; sizeBytes integer notNull; storagePath text notNull (относительный путь); originalName text nullable; createdAt timestamptz notNull defaultNow; индекс (trainerId). Миграция; schema.itest. Docker. Commit.

### Task A3: storage util + files repo + защищённая раздача

- [ ] `apps/api/src/files/storage.ts` — `makeStorage(uploadsDir)`: `save(trainerId, clientId, fileId, ext, stream|buffer): Promise<{path, size}>` (создаёт каталоги, пишет файл), `openRead(path): ReadStream`, `remove(path)`. Без БД, pure fs. Unit-тест с временным каталогом (`os.tmpdir`).
- [ ] `apps/api/src/modules/files/files.repo.ts` — `makeFilesRepo(db)` scoped по trainerId: `create({id,trainerId,clientId,mime,sizeBytes,storagePath,originalName})`, `getForTrainer(trainerId, id)` (или null), `delete(trainerId, id)` (вернуть строку для удаления с диска).
- [ ] `apps/api/src/modules/files/files.routes.ts` + module: `registerFilesModule(app,{db,storage})`. Роут `GET /api/files/:id` (requireAuth): repo.getForTrainer → 404 если null/чужой; иначе `reply.type(mime)` + стрим `storage.openRead(path)`. НЕ static. (Аплоад — через доменные модули progress-photos/medical, не общий аплоад-роут.)
- [ ] Подключить storage в `buildApp` (создать `makeStorage(env.UPLOADS_DIR)`, прокинуть в files-module и в progress/medical). Зарегистрировать `@fastify/multipart` (лимит 10 МБ).
- [ ] Контракты `@trener/shared/files.ts`: fileResponseSchema (id, mime, sizeBytes, originalName nullable, createdAt; + url `/api/files/:id` можно строить на клиенте).
- [ ] Тесты: storage unit; files.repo.itest; files.routes.itest (загрузить файл через домен → GET /api/files/:id отдаёт его; чужой → 404; без auth → 401). isolation: тренер B → 404 на файл A.
- [ ] `npm run check` + Docker. Commits (storage/repo/routes).

---

## Часть B — Progress-photos (под клиента)

### Task B1: схема `progress_photos` + контракты + миграция

- [ ] `progressPhotos` (`schema.ts`): id PK; trainerId notNull FK cascade; clientId notNull FK cascade; date text notNull; angle text `$type<'front'|'side'|'back'>()` notNull + check; fileId text notNull FK→files cascade; note nullable; createdAt; индекс (trainerId,clientId,date). Миграция; schema.itest. Контракты `@trener/shared/progress-photos.ts`: createPhoto (angle, date, note?) — файл идёт multipart-частью; photoResponseSchema (id, clientId, date, angle, note nullable, file: fileResponseSchema, createdAt); list. Commit(ы).

### Task B2: модуль progress-photos

- [ ] repo `makeProgressPhotosRepo(db)` scoped trainer+client (create со ссылкой на fileId; listForClient join files; getForTrainer; remove → вернуть file storagePath для удаления с диска). service `{newId}`. routes под `/api/clients/:id/progress-photos` `[requireAuth, requireClientAccess]`:
  - POST (multipart: поле `photo` = файл изображения jpg/png/webp ≤10МБ + поля angle/date/note) → storage.save + files.create + progressPhotos.create в транзакции → 201 {photo}.
  - GET list {photos}.
  - GET :pid {photo}.
  - DELETE :pid → удалить запись + file-строку + файл с диска → {ok}.
    module + app.ts. Тесты: repo.itest, service.test (типизир. мок), routes.itest (multipart upload → list показывает фото → GET /api/files/:fileId отдаёт байты → delete), isolation.itest (B→404). Валидация mime (только изображения) → 400 на неподдерживаемый.
- [ ] `npm run check` + Docker. Commits.

---

## Часть C — Medical-records (под клиента)

### Task C1: схема `medical_records` + контракты + миграция

- [ ] `medicalRecords` (`schema.ts`): id PK; trainerId notNull FK cascade; clientId notNull FK cascade; date text notNull; note text notNull; fileId text nullable FK→files set null (файл опционален); createdAt; индекс (trainerId,clientId,date). Миграция; schema.itest. Контракты `@trener/shared/medical.ts`: createMedicalRecord (date, note, файл опц. multipart); updateMedicalRecord (partial note/date); medicalRecordResponseSchema (id, clientId, date, note, file: fileResponseSchema nullable, createdAt); list. Commit(ы).

### Task C2: модуль medical-records

- [ ] repo scoped trainer+client (create с опц. fileId; listForClient join files; getForTrainer; update (note/date); remove → вернуть storagePath если был файл). service. routes под `/api/clients/:id/medical` `[requireAuth, requireClientAccess]`:
  - POST (multipart: опц. поле `file` = jpg/png/webp/pdf ≤10МБ + note/date) → если файл есть: storage.save+files.create; medicalRecords.create → 201.
  - GET list; GET :mid; PATCH :mid (note/date); DELETE :mid (+ удалить файл с диска если был).
    module + app.ts. Тесты: repo.itest, service.test, routes.itest (создать с файлом и без; листинг; скачать файл; delete чистит файл), isolation.itest (B→404).
- [ ] `npm run check` + Docker. Commits.

---

## Definition of Done (Фаза 6)

- `npm run check` зелёный; все itest проходят против Docker-Postgres.
- Task 0 доработки Фазы 5 закрыты.
- **File storage:** аплоад сохраняет на диск под `<trainerId>/<clientId>/`; `GET /api/files/:id` отдаёт стримом только владельцу-тренеру (404 чужому, 401 без auth); НЕ static; лимит 10МБ; валидация mime.
- **Progress-photos:** загрузка/листинг/удаление фото под клиента; удаление чистит файл с диска; только изображения.
- **Medical-records:** записи с опциональным файлом (img/pdf) + заметка/дата; CRUD под клиента; удаление чистит файл.
- **Изоляция** доказана (B→404 на файлы/фото/медзаписи A; без auth→401).
- Docker-volume `./data:/data` (уже в compose) хранит загрузки; миграции согласованы.

## Перенос в Фазу 7 (фиксируется здесь)

- Web SPA (React/Vite на новом API, БЕЗ экрана выбора роли и клиентских экранов — только тренер) + прод-деплой на VPS (наполнение deploy.yml: build образов → GHCR → ssh → compose up → migrate; backup-контейнер; TLS).
- Бэкап файлов (`uploads`) в составе резервного копирования.
- Эскизы/превью изображений, антивирус-проверка аплоадов — по надобности.
