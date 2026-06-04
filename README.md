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

Прод-стек собирается в три образа (`api`, `web`, `web-client`) и публикуется в
GHCR, после чего деплоится на VPS по SSH воркфлоу `.github/workflows/deploy.yml`
(триггер — push в `master` или ручной `workflow_dispatch`).

Перед стеком стоит **Caddy**: терминирует TLS и маршрутизирует по поддоменам
(автоматические сертификаты Let's Encrypt). Раскладка:

- `app.fitbond.ru` → приложение тренера (`apps/web`)
- `my.fitbond.ru` → приложение клиента (`apps/web-client`)

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

- VPS (2 vCPU / 4 ГБ RAM) с установленными Docker и Docker Compose (плагин
  `compose`).
- Каталог `/opt/trener` с `docker-compose.yml` и `caddy/Caddyfile` (те же, что в
  репозитории) и файлом окружения `.env`, где заданы `COOKIE_SECRET` и
  `POSTGRES_PASSWORD` (опционально `ACME_EMAIL`, `BACKUP_RETENTION_DAYS`).
- Домен `fitbond.ru` с делегированием на DNS Selectel; A-записи `app` и `my`
  указывают на IP сервера.
- Открыты порты `80` и `443` (для Caddy и выпуска сертификатов Let's Encrypt).
- TLS терминирует сам стек (Caddy) — внешний proxy не нужен.
- Бэкапы по умолчанию хранятся в Docker-volume `backups` на основном диске (с
  ротацией). Опционально: при росте загрузок подключить отдельный HDD,
  смонтировать в `/mnt/backups` и заменить в `docker-compose.yml` volume
  `backups:/backups` на bind-mount `/mnt/backups:/backups`.

### Поток деплоя

1. Push в `master` (или ручной запуск) → GitHub Actions.
2. Сборка и push образов `ghcr.io/<owner>/<repo>/{api,web,web-client}`
   (теги `<sha>` + `latest`).
3. SSH на VPS: экспортируются `API_IMAGE`/`WEB_IMAGE`/`WEB_CLIENT_IMAGE` с тегом
   `<sha>` → `docker compose pull` тянет именно эти образы из GHCR (закрепление
   по sha для надёжного отката).
4. Миграции БД из самого api-образа (без drizzle-kit, через `drizzle-orm`
   migrator): `docker compose run --rm api node apps/api/dist/migrate.js` —
   выполняется до `up -d`, чтобы схема была готова к старту сервиса.
5. `docker compose up -d` поднимает обновлённый стек.
6. Healthcheck `http://localhost:8080/api/health` (ожидается `ok:true`).

#### Переменные образов (`API_IMAGE` / `WEB_IMAGE` / `WEB_CLIENT_IMAGE`)

Сервисы `api`, `nginx` и `web-client` в `docker-compose.yml` указывают `image:`
через переменные с локальным дефолтом:

- `api` → `${API_IMAGE:-trener-api:local}`
- `nginx` → `${WEB_IMAGE:-trener-web:local}`
- `web-client` → `${WEB_CLIENT_IMAGE:-trener-web-client:local}`

Локально `docker compose up -d --build` собирает образы и тегирует их
локальными именами. На VPS воркфлоу задаёт `*_IMAGE=ghcr.io/<owner>/<repo>/<...>:<sha>`,
после чего `docker compose pull` скачивает готовые образы из GHCR (сборка на
сервере не нужна).

#### Бэкапы

Ежедневный бэкап выполняет сервис `backup`: `pg_dump` БД + `tar` каталога
`uploads` в `/mnt/backups` (смонтированный HDD), с ротацией — файлы старше
`BACKUP_RETENTION_DAYS` суток (по умолчанию 7) удаляются.

### Первичная настройка сервера (однократно)

```bash
# 1. Docker + compose
curl -fsSL https://get.docker.com | sh

# 2. Swap (для серверов с 4 ГБ RAM — против OOM)
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# 3. Каталог стека
mkdir -p /opt/trener/caddy
# скопировать сюда docker-compose.yml и caddy/Caddyfile из репозитория,
# создать /opt/trener/.env с COOKIE_SECRET и POSTGRES_PASSWORD

# (опционально) Отдельный HDD под бэкапы — когда загрузки вырастут:
#   mkfs.ext4 /dev/sdb          # только если диск пустой!
#   mkdir -p /mnt/backups
#   echo '/dev/sdb /mnt/backups ext4 defaults,nofail 0 2' >> /etc/fstab && mount -a
#   затем в docker-compose.yml: backups:/backups → /mnt/backups:/backups
```
