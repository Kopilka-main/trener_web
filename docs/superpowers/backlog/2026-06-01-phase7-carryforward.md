# Перенос в Фазу 7 (из ревью Фазы 6)

Зафиксировано по итогам code-review Фазы 6. Не блокеры — учесть в Фазе 7 (Web SPA + прод-деплой) или как полировку бэкенда.

## Доработки бэкенда (мелкие, из ревью)

1. **Non-atomic create files+domain.** В progress-photos.service и medical.service порядок `storage.save → filesRepo.create → repo.create` вне общей транзакции; при падении `repo.create` после `filesRepo.create` остаётся сиротская строка в `files` (диск чистится best-effort, БД-строка — нет). Обернуть БД-вставки (filesRepo.create + domain repo.create) в `db.transaction`, либо добавить `filesRepo.delete` в catch.
2. **multipart fieldSize не ограничен.** В `app.ts` multipart задаёт только `fileSize` (10МБ); добавить `limits.fieldSize`/`fields` (текстовые поля note/date/angle).
3. **Очистка temp uploadsDir в тестах.** При дефолтном `buildApp` без `uploadsDir` создаётся `mkdtempSync` в os.tmpdir и не чистится — мелкая утечка временных каталогов в unit-прогоне.
4. **Дублирование date/note-валидации** в progress-photos.routes и medical.routes — вынести общие zod-хелперы (date regex, note) в `@trener/shared` для гарантии согласованности.

## Объём Фазы 7 (из spec)

5. **Web SPA (только тренер)**: React 18 + Vite + TanStack Query + react-router + Tailwind v4 на НОВОМ API (`/api/*`). БЕЗ экрана выбора роли и клиентских экранов (приложение только тренерское). Экраны: вход/регистрация тренера, главная, клиенты (список/карточка/CRUD), база знаний (упражнения/шаблоны), тренировки клиента (план→проведение→завершение), календарь занятий, бухгалтерия, замеры/фото прогресса/медкарта, чат. UI-паттерны переносятся из MVP-репозитория `Trener/web` (мобильный 390×844). API-клиент + хуки TanStack Query на каждый домен. Vite-прокси `/api` на бэкенд в dev; в prod nginx раздаёт статику web + проксирует /api.
6. **Прод-деплой на VPS** (наполнение `deploy.yml`): build Docker-образов (api + web-статика) → push в GHCR → ssh на VPS → `docker compose pull && up -d` → `db:migrate` → healthcheck; backup-контейнер (pg_dump + архив uploads); TLS (Caddy/Let's Encrypt). Секреты в GitHub Secrets. **Требует от владельца**: VPS-хост, SSH-ключ, домен, заполнение GitHub Secrets — без них доводим до «готово к деплою».

## Перенос дальше (из прошлых фаз, всё ещё открыто)

7. Per-worker schema для параллелизма itest (Фазы 3-6) — с ростом числа itest полный прогон сериализован (`fileParallelism: false`).
8. Сид глобального каталога упражнений; глобальные шаблоны (если понадобятся).
9. Регистро-независимый unique-индекс email; CSRF при мутациях; тайминговая анти-энумерация login.
10. Клиентское приложение (клиентский вход/кабинет, приём/отправка клиентом сообщений чата) — отдельный крупный этап, если решит владелец (сейчас приложение только тренерское).
