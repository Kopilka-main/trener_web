# Перенос в Фазу 4 (из ревью Фазы 3)

Зафиксировано по итогам code-review доменного ядра (Фаза 3). Не блокеры Фазы 3 — учесть при планировании Фазы 4 (доменные модули: exercises, workout-templates, client-workouts, sessions).

## БД / целостность

1. **CHECK-констрейнт на `trainer_clients.status`.** Сейчас `status` — `text` с `$type<ClientStatus>()` (compile-time) + Zod-энум на границе; БД не запрещает произвольный текст. Добавить CHECK (`status IN ('active','archived')`) как defense-in-depth, особенно если появятся seed/импорт. То же касается будущих enum-полей доменных таблиц.
2. **Регистро-независимый unique-индекс email** (перенос из Фазы 2): при появлении seed/импорта — `lower(email)`/`citext`.

## Тесты

3. **Параллелизм itest.** Сейчас `fileParallelism: false` (`vitest.config.ts`) — itest шарят одну БД и чистят таблицы в `beforeEach`. При росте числа itest вернуть параллелизм через изоляцию на уровне БД: рекомендуется per-worker schema через `VITEST_POOL_ID` (`search_path` на воркер) — наименее инвазивно; альтернативы — транзакционный rollback на тест (осторожно с `db.transaction` в repo) или per-file ephemeral DB.
4. **Покрыть ветку missing-`id` в `requireClientAccess`** (unit) при переиспользовании guard.

## Архитектура (composition root)

5. **Общий провайдер `newId`/`now`.** Сейчас `newId: () => randomUUID()` дублируется в `app.ts` (auth) и `clients.module.ts`. Вынести в общий `AppDeps`/clock-провайдер и прокидывать сверху, чтобы каждый `register*Module` не хардкодил `randomUUID`/`new Date()`.
6. **`paramId(req)`-хелпер.** Каст `req.params as { id?: string }` в guard'ах — вынести в типизированный хелпер, когда guard'ов станет больше.
7. **Тайминговая анти-энумерация login** (перенос из Фазы 2): «dummy verify» для выравнивания времени, если потребуется (сейчас митигируется rate-limit).
8. **CSRF при мутациях** (перенос из Фазы 2): для cookie-аутентифицированных мутирующих доменных роутов решить `sameSite: 'strict'` vs CSRF-токен.

## Прямо в объёме Фазы 4 (из spec)

9. **Доменные модули** exercises, workout-templates, client-workouts, sessions — по эталону Фазы 3 (repo scoped по `trainerId`; вложенные под клиентом ресурсы используют `requireClientAccess`). Глобальный системный каталог упражнений/шаблонов (`trainer_id IS NULL`) + личные записи тренера.
10. **Расширение полей клиента** (дата рождения, рост, доп. контакты telegram/whatsapp/instagram/max) — по мере надобности.
11. **Поддержка очистки `phone`/`notes` через явный `null`** (сейчас YAGNI — null = «не трогать»).
12. **Очистка осиротевших `clients`** (персона без связей) — фоновая политика, если потребуется.
