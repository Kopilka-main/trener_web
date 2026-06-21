# Медкарта клиента — ClientMedicalPage.tsx

**Маршрут:** `/clients/:id/medical` · **Точки входа:** карточка клиента → «Медкарта»
**Назначение:** хронологический список заметок тренера о клиенте с опциональным вложением (фото/PDF) + форма добавления.

## Макет (сверху вниз)

1. **ScreenHeader** «Медкарта», назад → `/clients/:id`.
2. **Список записей** (новые сверху) — на каждую **RecordCard** (`tile-shadow`):
   - mono-кикер с датой (`formatDate` → «1 мая 2026») + **HoldToDelete** (удерж. → удалить).
   - текст заметки (`whitespace-pre-wrap`).
   - если есть файл — ссылка-карточка (`bg-card-elevated`, открывается в новой вкладке): превью-картинка (если mime `image/*`) или иконка FileText; имя файла + «Открыть».
3. **AddRecordForm** (`tile-shadow`, всегда внизу):
   - textarea заметки (`maxLength=4000`, плейсхолдер с примером).
   - date (по умолч. сегодня, локальная зона `todayIso`).
   - блок файла: либо превью выбранного (иконка по типу + имя + крестик «убрать»), либо пунктир-кнопка **«Добавить файл»** (`accept="image/*,application/pdf"`).
   - кнопка **«Добавить заметку»** (acid, `tile-shadow-primary`), disabled пока заметка пустая или идёт сохранение.

## Данные

| Поле        | Источник                                            | Формат               |
| ----------- | --------------------------------------------------- | -------------------- |
| записи      | `useMedicalRecords(id)` → `MedicalRecordResponse[]` | новые↑               |
| дата записи | `record.date` (`YYYY-MM-DD`)                        | ru-дата              |
| файл        | `record.file` (`fileResponseSchema \| null`)        | id/mime/originalName |
| URL файла   | `fileUrl(file.id)` = `/api/files/:id`               | приватный            |

`MedicalRecordResponse`: `id, clientId, date, note, file{id, mime, originalName, …} | null, createdAt`. Сортировка на клиенте: `date` ↓, при равенстве `createdAt` ↓.

## Действия (метод + путь + тело → ответ)

- **Добавить заметку** (`handleSubmit`) → `useCreateMedicalRecord` → **POST** `/api/clients/:id/medical` (**multipart/form-data**: `date`, `note` (trim, обязателен), опц. `file`; Content-Type ставит браузер — boundary). Отдельный `fetch` (не `apiFetch`, т.к. multipart) с `credentials:'include'`. Ответ `{record}`. При успехе форма сбрасывается. Инвалидирует `['clients',id,'medical']`.
- **Удалить запись** (HoldToDelete) → `useDeleteMedicalRecord` → **DELETE** `/api/clients/:id/medical/:recordId` → `{ok:true}`. Инвалидирует тот же ключ.
- **Открыть файл** → ссылка `target=_blank` на `/api/files/:id`.
- **Убрать файл из формы** — локально (`setFile(null)` + сброс input).

## Состояния

- **loading**: «Загрузка…».
- **error**: «Не удалось загрузить медкарту.» (`role=alert`).
- **empty**: «Пока пусто. Добавьте заметку или прикрепите файл.»
- **ошибка создания**: текст из `ApiError.message` (если есть) либо «Не удалось сохранить запись.» (`text-danger`, `role=alert`).
- Кнопка отправки disabled при `note.trim()===''` или `create.isPending`; во время сохранения — «Сохранение…».

## Навигация

назад → `/clients/:id`. Файл — внешняя вкладка (`/api/files/:id`).

## Бизнес-правила и edge-cases

- **Заметка обязательна** (min 1, max 4000); файл — опционален.
- Файл принимается только `image/*` и `application/pdf`; превью-картинка показывается лишь при `mime.startsWith('image/')`, иначе иконка FileText.
- `todayIso` учитывает локальную зону (сдвиг на `getTimezoneOffset`).
- Список приходит без гарантии порядка — сортируется на клиенте.
- PATCH медзаписи (только date/note, без файла) существует на бэке (`updateMedicalRecordRequestSchema`), но **в этом экране не используется** — правки нет, только создание/удаление.

## Сводка эндпоинтов

- `GET /api/clients/:id/medical` — записи медкарты.
- `POST /api/clients/:id/medical` (multipart `date`+`note`+опц.`file`) — создать запись → `{record}`.
- `DELETE /api/clients/:id/medical/:recordId` — удалить запись → `{ok:true}`.
- `GET /api/files/:id` — приватный файл вложения.
