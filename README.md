# Тренер (Prod)

Мультитенантный SaaS для персональных тренеров: клиенты, база упражнений и
тренировок, проведение тренировки с таймером отдыха, календарь, бухгалтерия, чат,
замеры и фото прогресса.

Это продакшен-переписывание MVP-прототипа (репозиторий `Trener`). Архитектура и
стандарты разработки описаны в дизайн-документе:

- [docs/superpowers/specs/2026-05-31-production-rewrite-design.md](docs/superpowers/specs/2026-05-31-production-rewrite-design.md)

## Стек

- **Backend:** Node 20 + Fastify + Drizzle ORM + PostgreSQL 16 + Zod (TypeScript)
- **Frontend:** React 18 + Vite + TanStack Query + Tailwind v4
- **Инфра:** Docker Compose (nginx + api + postgres), GitHub Actions

Структура и команды появятся по мере реализации (см. план в
`docs/superpowers/plans/`).

## Деплой

Прод-стек собирается в два образа (`api`, `web`) и публикуется в GHCR, после
чего деплоится на VPS по SSH воркфлоу `.github/workflows/deploy.yml` (триггер —
push в `master` или ручной `workflow_dispatch`).

### GitHub Secrets

Заполняются в **Settings → Secrets and variables → Actions**:

| Secret              | Назначение                                                              |
| ------------------- | ----------------------------------------------------------------------- |
| `GITHUB_TOKEN`      | Выдаётся автоматически; используется для push образов в GHCR.           |
| `VPS_HOST`          | Хост (IP/домен) сервера для SSH-деплоя.                                 |
| `VPS_USER`          | Пользователь SSH на сервере.                                            |
| `VPS_SSH_KEY`       | Приватный SSH-ключ (PEM) для входа на сервер.                           |
| `COOKIE_SECRET`     | Секрет подписи cookie-сессий (≥ 32 символа); пробрасывается в api.      |
| `POSTGRES_PASSWORD` | Пароль пользователя postgres БД (api + бэкап используют один и тот же). |

### Требования к серверу

- VPS с установленными Docker и Docker Compose (плагин `compose`).
- Каталог `/opt/trener` с `docker-compose.yml` (тот же, что в репозитории) и
  файлом окружения, где заданы `COOKIE_SECRET` и `POSTGRES_PASSWORD`.
- Зарегистрированный домен, направленный на VPS.
- TLS-терминация **перед** nginx этого стека (например, внешний reverse-proxy
  Caddy/Traefik или certbot): сам стек слушает HTTP на `8080`, HTTPS не
  обслуживает.

### Поток деплоя

1. Push в `master` (или ручной запуск) → GitHub Actions.
2. Сборка и push образов `ghcr.io/<owner>/<repo>/api` и `.../web`
   (теги `<sha>` + `latest`).
3. SSH на VPS: экспортируются `API_IMAGE`/`WEB_IMAGE` с тегом `<sha>` →
   `docker compose pull` тянет именно эти образы из GHCR (закрепление по sha
   для надёжного отката).
4. Миграции БД из самого api-образа (без drizzle-kit, через `drizzle-orm`
   migrator): `docker compose run --rm api node apps/api/dist/migrate.js` —
   выполняется до `up -d`, чтобы схема была готова к старту сервиса.
5. `docker compose up -d` поднимает обновлённый стек.
6. Healthcheck `http://localhost:8080/api/health` (ожидается `ok:true`).

#### Переменные образов (`API_IMAGE` / `WEB_IMAGE`)

Сервисы `api` и `nginx` в `docker-compose.yml` указывают `image:` через
переменные с локальным дефолтом:

- `api` → `${API_IMAGE:-trener-api:local}`
- `nginx` → `${WEB_IMAGE:-trener-web:local}`

Локально `docker compose up -d --build` собирает образы и тегирует их
локальными именами (`trener-api:local`, `trener-web:local`). На VPS воркфлоу
задаёт `API_IMAGE=ghcr.io/<owner>/<repo>/api:<sha>` и
`WEB_IMAGE=ghcr.io/<owner>/<repo>/web:<sha>`, после чего `docker compose pull`
скачивает готовые образы из GHCR (сборка на сервере не нужна).

Ежедневный бэкап выполняет сервис `backup` в `docker-compose.yml`: `pg_dump`
БД + `tar` каталога `uploads` в volume `backups` (раз в сутки).
