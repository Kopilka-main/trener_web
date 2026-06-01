# Перенос в Фазу 6 (из ревью Фазы 5)

Зафиксировано по итогам code-review Фазы 5. Не блокеры — учесть при планировании Фазы 6 (файлы: progress-photos, медкарта).

## Доработки (мелкие, из ревью)

1. **Chat polling tie-break.** `listMessages` сортирует только по `createdAt` и фильтрует `gt(createdAt, since.createdAt)` — при равных timestamp возможен пропуск. Перейти на составной курсор `(createdAt, id)` + `orderBy(asc(createdAt), asc(id))`. Актуально при вводе клиентской стороны чата.
2. **Нетранзакционный `addMessage`** (chat.repo): insert сообщения + update `lastMessageAt` двумя statement — обернуть в `db.transaction`.
3. **Порядок ref-check vs 404 в `updateExpense`** (accounting.service): `assertExpenseRefs` вызывается до проверки существования → PATCH несуществующего expense с битым gymId даёт 400 вместо 404. Поменять порядок (сперва 404).
4. **Accounting isolation-тест: добавить явный кейс no-auth → 401** (для буквального DoD; механизм requireAuth идентичен и покрыт в других модулях).
5. **Conversation id детерминирован** `conv_{trainerId}_{clientId}` — работает, но отступает от newId-конвенции; при желании единообразия перейти на `clock.newId`.

## Прямо в объёме Фазы 6 (из spec)

6. **Файловое хранилище** (`@fastify/multipart`): аплоады в `/data/uploads/<trainer_id>/<client_id>/`; таблица `files` (owner trainer_id+client_id, mime, размер, путь); защищённый роут раздачи `GET /api/files/:id` (проверка scope, стрим — НЕ static); лимиты размера/типа; volume `./data:/data`.
7. **Progress-photos** (фото прогресса под клиента): запись `progress_photos` (date, angle front/side/back, file_id) + аплоад/листинг/удаление; вложено под клиента (requireClientAccess).
8. **Медкарта**: файлы + заметки, разбивка по дате; под клиента.

## Перенос дальше (из прошлых фаз, всё ещё открыто)

9. Per-worker schema для параллелизма itest (Фазы 3-5).
10. Сид глобального каталога упражнений; глобальные шаблоны (если понадобятся).
11. Регистро-независимый unique-индекс email (при появлении seed/импорта).
12. CSRF при мутациях / тайминговая анти-энумерация login (при росте поверхности).
