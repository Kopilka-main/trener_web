# Переписывание «Тренер» под продакшен (SaaS) — дизайн

Дата: 2026-05-31

## Цель

Переписать приложение «Тренер» с нуля как мультитенантный SaaS, готовый к
продакшену среднего масштаба (сотни–тысячи пользователей). Текущий код
(репозиторий `Trener`: `web/`, `server/`, `github_demo/`) — MVP на SQLite с
заглушкой авторизации в `localStorage`; он заменяется новой архитектурой. Перенос
данных не требуется — старт с нуля, базовый каталог упражнений/шаблонов
сидируется заново.

## Вводные (решения владельца)

- **Модель:** мультитенантный SaaS, много независимых тренеров.
- **Авторизация:** email + пароль. **На текущем этапе логинится только тренер**;
  клиентский вход/кабинет — отдельный поздний этап (см. «Объём текущего этапа»).
- **Связь тренер↔клиент:** M:N — один клиент может заниматься у нескольких
  тренеров. При этом данные **скоупятся по паре (тренер, клиент)**: каждый тренер
  видит только свои тренировки/занятия/оплаты/замеры с этим клиентом.
- **Real-time:** не нужен, достаточно polling (как сейчас).
- **Файлы:** локальный диск + Docker volume (не object storage).
- **Деплой:** VPS + Docker Compose, PostgreSQL.
- **Объём:** полный rewrite backend и frontend.
- **Стек:** TypeScript end-to-end.
- **Email-провайдер:** реальный (через абстракцию `Mailer`, конкретика — конфигом).

## Объём проекта (только тренер)

Приложение — **только тренерское**. Клиентского приложения нет: ни экрана выбора
роли, ни клиентского входа, ни клиентского кабинета, ни клиентских аккаунтов.

- Логинится **только тренер**. Клиент — это **запись**, которой управляет тренер
  (создаёт, ведёт тренировки/занятия/оплаты/замеры). Клиент в систему не входит.
- В модели данных **нет** `users.role = 'client'` и `clients.user_id` — клиентских
  учёток не существует.
- Пользователь системы = тренер. `requireClient` и клиентские роуты из дизайна
  исключаются. `clients` — справочник людей, которыми владеет/управляет тренер.

## Расположение

Новый проект разрабатывается в **отдельной папке и отдельном git-репозитории**:
`C:\Users\shlya\Desktop\Trener_Prod`. Текущий репозиторий `Trener` (MVP) не
изменяется — служит только источником UI-паттернов и доменной модели. Этот
spec хранится канонично в новом репозитории.

## Выбранный подход

Модульный монолит на **Fastify** + **PostgreSQL** (через **Drizzle ORM**) +
отдельная **React + Vite SPA**, всё в монорепо, деплой через Docker Compose
(nginx + api + postgres). Отклонены: full-stack мета-фреймворк (Next.js —
избыточный SSR, сильная связанность, мешает будущей Capacitor-сборке) и NestJS
(избыточный boilerplate для среднего масштаба).

## Архитектура

### Структура репозитория (монорепо, npm workspaces)

```text
trener-prod/
├── packages/
│   └── shared/              # общие типы + Zod-схемы (DTO, валидация) — один
│       └── src/             #   источник правды для API-контракта
├── apps/
│   ├── api/                 # Fastify backend
│   │   ├── src/
│   │   │   ├── modules/     # по домену: clients/ exercises/ sessions/ ...
│   │   │   │   └── clients/
│   │   │   │       ├── clients.routes.ts    # HTTP-слой
│   │   │   │       ├── clients.service.ts   # бизнес-логика
│   │   │   │       ├── clients.repo.ts      # доступ к БД (Drizzle)
│   │   │   │       └── clients.schema.ts    # Zod-схемы запрос/ответ
│   │   │   ├── db/          # схема Drizzle + миграции
│   │   │   ├── auth/        # хеш паролей, сессии, guard'ы
│   │   │   ├── plugins/     # cors, error-handler, tenant-context, rate-limit
│   │   │   └── server.ts    # точка входа
│   │   └── Dockerfile
│   └── web/                 # React + Vite SPA
├── docker-compose.yml       # nginx + api + postgres
├── nginx/                   # reverse-proxy: /api → api, / → статика web
├── .github/workflows/       # ci.yml, deploy.yml
├── AGENTS.md / CLAUDE.md    # стандарты разработки (для людей и AI)
└── package.json             # workspaces, скрипты dev/build/check
```

### Слои backend и их границы

- **routes** — только HTTP: разбор запроса, вызов сервиса, формат ответа.
  Валидация входа и сериализация выхода — Zod-схемами из `shared`. Бизнес-логики
  нет.
- **service** — бизнес-логика, не знает про HTTP. Принимает scope
  (`trainerId`) из контекста запроса.
- **repo** — единственное место с SQL/Drizzle. Каждый запрос **обязан**
  принимать scope и фильтровать по нему (`WHERE trainer_id = ?`).

Границы принуждаются ESLint-правилом `no-restricted-imports`: routes не
импортирует repo напрямую, repo не импортирует HTTP-слой.

## Модель данных и изоляция тенанта

### Расщепление сущности клиента

```text
clients          -- ЧЕЛОВЕК (общая идентичность, БЕЗ учётки — клиент не логинится):
                 --   id, first_name, last_name, birth_date,
                 --   height_cm, phone, контакты (telegram/whatsapp/instagram/max)
trainer_clients  -- СВЯЗЬ тренер↔клиент + профиль клиента ГЛАЗАМИ этого тренера:
                 --   PK (trainer_id, client_id), notes, hashtags, schedule_day,
                 --   schedule_time, current_training_type, online_until, status,
                 --   created_at
```

### Доменные таблицы

Все несут `trainer_id` + `client_id` и индекс `(trainer_id, client_id)`:

```text
client_workouts, client_workout_exercises, client_workout_sets,
sessions, payment_packages, expenses, incomes (без client_id — общий доход),
measurements, progress_photos, medical_records, conversations, messages
```

Справочники тренера (личные) несут `trainer_id`; глобальные системные записи —
`trainer_id IS NULL`:

```text
exercises, workout_templates, workout_template_exercises, gyms
```

### Учётки

Учётка есть только у тренера — клиентских аккаунтов нет.

```text
trainers     -- id, email (нормализован, уникальный индекс), password_hash,
             --   first_name, last_name, title, specialties, bio, ..., created_at
sessions_auth-- id (session token), trainer_id, expires_at, created_at
```

Отдельной таблицы `users` с ролями нет: пользователь = тренер, учётные данные
живут прямо в `trainers`. (Если в будущем понадобятся другие роли — выделяется
`users`; сейчас это YAGNI.)

### Инвариант изоляции

- **Тренер** читает/пишет только `WHERE trainer_id = :currentTrainer`. Видит
  только своих клиентов (через `trainer_clients`) и только свои данные по ним.
- Связь тренер↔клиент — **M:N** (`trainer_clients`): один человек-клиент может
  быть привязан к нескольким тренерам, но каждый тренер видит только своё.
- Слой `repo` обязан принимать scope (`trainerId`) — изоляция прошита в данные,
  а не в код вызова. Нарушение ловится security-тестами в CI.

### Справочники

Глобальный системный каталог (`trainer_id IS NULL`, виден всем) + личные записи
тренера. Тренер может скопировать системную запись в свою и редактировать.

### Миграции

Drizzle Kit — версионируемые SQL-миграции в git. Никаких `ensureColumn` на
старте сервера (как в текущем `db.ts`). Миграции применяются отдельным шагом до
приёма трафика.

## Авторизация и сессии

- **Пароли:** argon2id. Email нормализуется (lowercase, trim), уникальный индекс.
- **Сессии:** httpOnly + Secure + SameSite=Lax cookie с session id; сами сессии
  в таблице `sessions_auth` (позже — Redis). Выбор cookie, а не JWT в
  localStorage: защита от XSS-кражи, мгновенный отзыв/logout, CSRF закрывается
  SameSite + проверкой Origin.
- **Контекст:** plugin `tenant-context` на каждый запрос достаёт сессию →
  грузит тренера → кладёт в request `{ trainerId }`.
- **Guard'ы:** `requireAuth` (есть валидная сессия тренера),
  `requireClientAccess(clientId)` (проверка связи тренер↔клиент через
  `trainer_clients`; отказ → 404, чтобы не раскрывать существование сущности).
  Клиентских guard'ов нет.
- **Безопасность по умолчанию:** rate-limit на `/auth/*`, helmet-заголовки,
  лимит размера тела, CORS только на свой origin.
- **Восстановление пароля:** токен на email через абстракцию `Mailer`
  (конкретный SMTP/провайдер — конфигом).

### Поток запроса

```text
request → cors → rate-limit → cookie-сессия → tenant-context (trainerId)
        → route (Zod-валидация) → guard → service(trainerId) → repo(WHERE trainer_id)
        → Zod-сериализация ответа
```

## Файлы

- Аплоады через `@fastify/multipart` в `/data/uploads/<trainer_id>/<client_id>/`.
- Раздача через защищённый роут `GET /api/files/:id`: проверка принадлежности
  scope текущего пользователя, затем стрим. Прямой `express.static` (как сейчас)
  не используется — медкарта/фото приватны.
- Метаданные (owner, mime, размер, путь) — в таблице `files`. Лимиты размера/типа
  на входе.
- Volume `./data:/data` переживает пересборку контейнера; входит в бэкап.

## Обработка ошибок

- Единый `error-handler` plugin Fastify. Доменные ошибки бросаются как типы с
  `status` и `code`; handler сериализует в `{ error, code, details? }`.
- Zod-ошибки валидации → 400 с деталями полей.
- Непредвиденные ошибки → 500, логируются (structured logging, `pino`), наружу не
  утекают детали.
- Отказ в доступе к чужому тенанту → 404 (не 403).

## Деплой (VPS + Docker Compose)

```text
docker-compose.yml:
  nginx     → reverse-proxy, TLS (Caddy/Let's Encrypt), / → web-статика, /api → api
  api       → Fastify (Node 20), env-конфиг, healthcheck /api/health
  postgres  → Postgres 16, volume pgdata
  backup    → cron-контейнер: ежедневный pg_dump + архив uploads → backups volume
volumes: pgdata, uploads, backups
```

- web билдится в статику, раздаётся nginx (отдельный контейнер не нужен).
- Конфиг только через env (`DATABASE_URL`, `COOKIE_SECRET`, `SMTP_*`…); секретов
  в git нет; `.env.example` в репо.
- Миграции применяются на старте api отдельным шагом до приёма трафика.
- Rollback = откат на предыдущий тег Docker-образа.

## Стандарты разработки + CI/CD + тестирование

### Стандарты кода (enforced автоматически)

| Стандарт             | Инструмент                                       | Где проверяется      |
| -------------------- | ------------------------------------------------ | -------------------- |
| Форматирование       | Prettier (единый конфиг)                         | pre-commit + CI      |
| Линтинг + правила    | ESLint (typescript-eslint, strict)               | pre-commit + CI      |
| Типобезопасность     | `tsc --noEmit` (strict: true)                    | pre-commit + CI      |
| Тесты + покрытие     | Vitest + порог coverage                          | CI (gate)            |
| Сообщения коммитов   | commitlint (Conventional Commits)                | commit-msg hook + CI |
| Запрет грязного кода | ESLint: no `any`, no unused, no `console` в prod | CI                   |
| Граница слоёв        | ESLint `no-restricted-imports`                   | CI                   |

- pre-commit через Husky + lint-staged (формат/линт/typecheck на изменённых
  файлах).
- Конфиги в корне репо, общие для всех пакетов.
- `npm run check` = format:check + lint + typecheck + test (одна команда локально
  и в CI).

### Документ стандартов для AI и людей

Файл `AGENTS.md` в корне (дублируется как `CLAUDE.md`), содержит:

- архитектурные инварианты (scope в каждом repo-запросе; валидация только
  Zod-схемами из `shared`; никаких секретов в коде; приватные файлы только через
  защищённый роут);
- структуру модуля (routes/service/repo/schema) и куда что класть;
- правила тестирования (что обязательно покрывать);
- команды (`npm run check`, `npm run dev`, `npm run test`);
- запреты (`any`, бизнес-логика в routes, прямой `static` для приватных файлов).

Принцип: **AGENTS.md описывает правила словами, ESLint/CI их принуждают** —
нарушение инварианта роняет проверку и видно в PR. Это и есть механизм, которым
AI-ассистент удерживается в рамках стандартов.

### Тестирование (пирамида)

- **Unit** (Vitest): сервисы с замоканным repo — бизнес-логика, граничные случаи.
- **Integration** (Vitest + тестовая Postgres, миграции перед прогоном): repo +
  реальная БД.
- **Security/isolation-тесты** (обязательны, всегда в CI): тренер A не читает
  данные тренера B; клиент видит только своё; неаутентифицированный → 401;
  доступ к чужому клиенту → 404.
- **E2E** (Playwright, smoke): логин тренера → создать клиента → тренировка →
  завершить. На ключевых ветках.
- Порог покрытия стартует с 70% по `services/`, повышается со временем.

### CI/CD (GitHub Actions)

```text
.github/workflows/
  ci.yml       # на каждый PR и push:
               #   1) install (кеш npm)
               #   2) lint + format:check + typecheck
               #   3) test (unit+integration) с Postgres-сервисом + coverage gate
               #   4) build api + web
               #   5) e2e smoke (Playwright)
  deploy.yml   # на push в master после зелёного ci:
               #   build Docker-образов → push в GHCR
               #   ssh на VPS → docker compose pull && up -d → migrate → healthcheck
```

- Branch protection на `master`: PR обязателен, CI обязателен, без прямых пушей.
- Деплой только после зелёного CI.
- Секреты деплоя (SSH-ключ, registry) — в GitHub Secrets.

## Стек (итог)

- **Backend:** Node 20, Fastify, Drizzle ORM, PostgreSQL 16, Zod, argon2,
  pino, @fastify/multipart, @fastify/rate-limit, @fastify/helmet.
- **Frontend:** React 18, Vite, TanStack Query, react-router, Tailwind v4,
  @dnd-kit, lucide-react (паттерны переносятся из текущего `web/`).
- **Общее:** TypeScript strict, npm workspaces, Vitest, Playwright, ESLint,
  Prettier, Husky, commitlint.
- **Инфра:** Docker Compose (nginx/Caddy + api + postgres + backup), GitHub
  Actions, GHCR.

## Что не входит в объём (YAGNI)

- WebSocket/настоящий real-time (polling достаточно).
- Object storage / CDN для файлов (локальный диск + volume).
- Redis для сессий (таблица в Postgres; Redis — на будущее).
- Перенос данных из текущего SQLite (старт с нуля).
- Клиентское приложение: клиентский вход, клиентский кабинет, клиентские роуты/UI
  (поздний этап; модель данных к этому готова — см. «Объём текущего этапа»).
- Биллинг/подписки SaaS, мультиязычность, нативные мобильные приложения
  (Capacitor — на будущее, API проектируется так, чтобы это не мешало).
