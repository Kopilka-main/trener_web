# Фаза 7: Web SPA (только тренер) + прод-деплой — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Тренерское веб-приложение (React SPA) на готовом API Фаз 1–6 + готовая к запуску прод-инфраструктура (сборка web-статики, nginx-раздача, deploy.yml, backup). Приложение только тренерское — без экрана выбора роли и клиентских экранов.

**Architecture:** `apps/web` — Vite + React 18 + TypeScript + TanStack Query + react-router + Tailwind v4. Типизированный API-клиент использует Zod-контракты и типы из `@trener/shared` (один источник правды фронт↔бэк). Cookie-сессия (httpOnly) — браузер шлёт автоматически; запросы с `credentials: 'include'`. Auth-гейт: незалогиненный → /login. Мобильный layout (390×844), паттерны переносятся из MVP `Trener/web`. Prod: nginx раздаёт собранную статику web + проксирует `/api` на api-контейнер.

**Tech Stack:** React 18, Vite 6, TypeScript strict, @tanstack/react-query 5, react-router 6, Tailwind v4, Zod (через @trener/shared). Dev: Vite-прокси `/api`→:3001.

**Подход к объёму:** строим фундамент + auth + app-shell + типизированный data-слой, затем эталонный вертикальный срез (клиенты, упражнения), затем остальные экраны итеративно по тому же паттерну. Реальный деплой на VPS требует кредов владельца (хост/SSH/домен/секреты) — доводим до «готово к деплою».

---

## Эталоны / источники

- Контракты и типы: `packages/shared/src/*` (auth, clients, exercises, workout-templates, client-workouts, sessions, packages, accounting, measurements, chat, files) — фронт переиспользует request/response-схемы и типы.
- UI-референс (паттерны, не код напрямую): MVP `C:\Users\shlya\Desktop\Trener\web\src` (мобильный UI, экраны 01–09). НЕ копировать дословно (другой API/роли) — брать визуальные паттерны.
- API: все роуты под `/api/*` (см. модули). Auth: POST `/api/auth/register`/`/login`/`/logout`, GET `/api/auth/me`.
- Конвенции: ветка фазы; Conventional Commits (subject нижний регистр); `npm run check` зелёный; границы — web отдельный workspace.

---

## Часть A — Web foundation + data-слой

### Task A1: scaffold apps/web (Vite+React+TS+Tailwind+router+query)

- [ ] Создать `apps/web` (npm workspace): `package.json` (vite, react, react-dom, @tanstack/react-query, react-router-dom, tailwindcss v4 + @tailwindcss/vite, zod, `@trener/shared`; dev: typescript, @vitejs/plugin-react, @types/react). `tsconfig.json` (extends base, jsx react-jsx, types vite/client, references shared). `vite.config.ts` (react + tailwind plugins, server.proxy `/api`→`http://localhost:3001`, port 5173). `index.html`, `src/main.tsx` (QueryClientProvider + RouterProvider), `src/index.css` (tailwind import). Базовый `App.tsx` (роутер-заглушка). Добавить `dev`/`build`/`typecheck`/`lint` скрипты в web; обновить корневой `package.json` `dev` (concurrently api+web) — опционально. `npm run check` (web в lint/typecheck) → 0. Commit.

### Task A2: типизированный API-клиент + query-хуки (auth)

- [ ] `src/api/client.ts` — `apiFetch<T>(path, {method, body, schema?})`: fetch с `credentials:'include'`, JSON, бросает типобезопасную ошибку `{status, code, message}` при !ok (парсит `{error,code}`); опц. валидация ответа Zod-схемой из shared. `src/api/auth.ts` — функции register/login/logout/me (используют request-схемы shared) + TanStack Query хуки (`useMe`, `useLogin`, `useRegister`, `useLogout` с инвалидацией). Юнит-тест client (мок fetch: ok/!ok/мап ошибки). Commit.

### Task A3: app-shell + auth-гейт + login/register

- [ ] `src/App.tsx` — роутер: публичные `/login`, `/register`; защищённые маршруты под auth-гейтом (если `useMe` 401 → redirect /login). App-shell: мобильный контейнер (max-w 430, h-screen), нижняя навигация (BottomNav: Клиенты/База/Календарь/Ещё — по принципу «нижние контролы»), header. `src/pages/LoginPage.tsx`, `RegisterPage.tsx` (формы email+пароль, вызывают useLogin/useRegister, ошибки показываются нейтрально). `HomePage.tsx` (плитки). Базовые UI-компоненты (Button, Field, Card) минимально. Тест: рендер LoginPage, сабмит зовёт хук (RTL + мок). Commit.

---

## Часть B — Прод-деплой инфраструктура (готово к запуску)

### Task B1: web Dockerfile (build статики) + nginx раздача + compose

- [ ] `apps/web/Dockerfile` (multi-stage: build статики Vite → копировать в финальный образ ИЛИ отдавать через общий nginx). Решение: web билдится в статику, **nginx-образ** монтирует/копирует `web/dist` и раздаёт `/`, проксирует `/api`→api. Обновить `nginx/nginx.conf`: `location /` → раздача статики (try_files $uri /index.html для SPA), `location /api/` → proxy api. Обновить `docker-compose.yml`: web-build-стадия кладёт dist в volume/образ nginx; либо отдельный билд-шаг копирует dist в nginx. Прогон: `docker compose up --build` → открыть `http://localhost:8080`, SPA грузится, `/api/health` отвечает. Commit.

### Task B2: deploy.yml (GHCR + ssh) + backup-контейнер

- [ ] Наполнить `.github/workflows/deploy.yml`: триггер push master (после CI); шаги — build образов (api, nginx+web-static) → push в `ghcr.io/<owner>/...` → ssh на VPS (`appleboy/ssh-action` или scp+ssh) → на сервере `docker compose pull && docker compose up -d` → `db:migrate` → healthcheck `/api/health`. Секреты через `${{ secrets.* }}` (GHCR_TOKEN, VPS_HOST, VPS_USER, VPS_SSH_KEY, COOKIE_SECRET, POSTGRES_PASSWORD). Добавить в `docker-compose.yml` сервис `backup` (cron-образ: ежедневный `pg_dump` + `tar uploads` в volume `backups`). README-секция «Деплой»: что владелец должен заполнить (Secrets, VPS, домен, TLS через Caddy/certbot). НЕ требует реального VPS для коммита — workflow валиден синтаксически. Commit.

---

## Часть C — Доменные экраны (эталон + остальные)

### Task C1: Клиенты (эталонный вертикальный срез)

- [ ] `src/api/clients.ts` (хуки list/get/create/update/delete на `/api/clients`). Экраны: `ClientsPage` (список + поиск + FAB «добавить»), `ClientEditPage` (создание/редактирование), `ClientCardPage` (карточка с навигацией к тренировкам/замерам/etc). Оптимистичные/инвалидирующие мутации TanStack Query. Тест: ClientsPage рендерит список из мока. Commit. ЭТО ЭТАЛОН для остальных доменов.

### Task C2: База знаний — упражнения + шаблоны

- [ ] `src/api/exercises.ts`, `src/api/workout-templates.ts` + экраны KnowledgeBasePage (табы Упражнения/Шаблоны), редакторы. По эталону C1. Commit.

### Task C3–C7 (итеративно, по эталону C1): тренировки клиента (план→проведение→завершение с таймером), календарь занятий, бухгалтерия, замеры+фото прогресса+медкарта (загрузка файлов), чат (polling).

- [ ] Каждый домен: `src/api/<m>.ts` (хуки) + экраны под клиента/верхнеуровневые. Файлы (фото/медкарта) — multipart upload через FormData; раздача через `/api/files/:id`. Чат — polling через refetchInterval. Коммиты по домену.

> Примечание: C3–C7 — большой объём UI; реализуются итеративно после C1/C2, каждый по проверенному паттерну. Если объём не помещается в одну сессию — фиксируются как «готов data-слой + основные экраны», остальные экраны достраиваются инкрементально.

---

## Definition of Done (Фаза 7)

- `npm run check` зелёный (web в lint/typecheck/test).
- **Foundation:** apps/web на Vite+React+TS+Tailwind+router+query; типизированный API-клиент на контрактах @trener/shared; dev-прокси /api.
- **Auth:** регистрация/вход/выход тренера через cookie-сессию; auth-гейт (401→/login); /me.
- **App-shell:** мобильный layout + нижняя навигация.
- **Deploy-ready:** web билдится в статику, nginx раздаёт SPA + проксирует /api (проверено локально `docker compose up`); deploy.yml наполнен (GHCR+ssh, секреты-плейсхолдеры); backup-контейнер; README про деплой. Реальный деплой — после заполнения владельцем Secrets/VPS.
- **Экраны:** клиенты (CRUD) + база знаний (упражнения/шаблоны) как эталон; остальные домены — data-слой + основные экраны (итеративно).
- Приложение только тренерское (нет выбора роли / клиентских экранов).

## Известные ограничения / дальше

- Полный набор всех экранов и пиксель-перфект — итеративная достройка по эталону.
- Реальный прод-деплой требует кредов владельца (VPS/SSH/домен/Secrets) + TLS.
- e2e (Playwright) smoke на ключевой флоу (логин→клиент→тренировка) — желательно добавить.
- Backend-доработки из backlog Фазы 7 (non-atomic create, multipart fieldSize) — параллельно.
