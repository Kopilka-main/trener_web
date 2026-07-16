# Офлайн Фаза 1 — прогресс исполнения (subagent-driven)

Ветка: feat/offline-phase1
itest DB: postgres://postgres:test@localhost:5433/trener_test

## План 1 — бэкенд import

- [x] Task 1: shared-схема importWorkoutRequest (commit 948f507, review clean)
- [x] Task 2: колонка idempotency_key + миграция (commit bf20dbc, review clean)
- [x] Task 3: repo.importWithKey (commit 2e00111, itest green)
- [x] Task 4: service.import (commit bcded25, unit green)
- [x] Task 5: роут + itest (commit efa62d4, module 62 tests green)
      Task 1-5 + review-fix complete (fix commit 1e42042, 63 tests green)
      DEPLOYED to prod (user): миграция 0064 + роут /workouts/import подтверждены на боевой БД/API.

## План 2 — ядро-движок (packages/core, mobile)

- [x] Task 1: KvStore + Outbox (commit dc7091a, 4/4 green)
- [x] Task 2: NetworkStatus (commit 83fd655, 2/2 green)
- [x] Task 3: SyncEngine (commit 03bad91, 7/7 green)
- [x] Task 4: CachedListNotifier (commit 7bdedb6, 11/11 all offline green) — ПЛАН 2 ГОТОВ

## План 3 — провод в тренера (mobile)

- [x] Task 1: importWorkout + isOfflineError (commit 2108646, 2/2 green)
- [x] Task 2: LocalWorkout + LocalWorkoutController (commit fd33348, 4/4). Пакет: trener_trainer
- [x] Task 3: офлайн-провайдеры (commit 7c19709, green)
- [x] Task 4: cache-first клиенты/шаблоны (commit 8131b81, analyze clean)
- [x] Task 5-6: скоупный дуал-режим ГОТОВ (Commit B=2618265, analyze green). ПЛАН 3 ГОТОВ.
- [ ] Task 6: баннер офлайна + индикатор
      финальный ревью: 0 Critical, 3 Important + minors — чиню
