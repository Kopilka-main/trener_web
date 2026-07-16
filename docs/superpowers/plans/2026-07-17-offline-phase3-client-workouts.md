# Офлайн Фаза 3 — тренировки клиента офлайн (список, история, FAB)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Шаги — чекбоксы `- [ ]`.

**Goal:** Закрыть три дыры, найденные на устройстве: (1) у клиента офлайн пустой список тренировок → нечего проводить; (2) завершённая офлайн-тренировка не видна в истории до синка; (3) нет FAB «вернуться к идущей тренировке» для локальной (офлайн) тренировки.

**Architecture:** Тот же приём, что в Фазе 2: сеть → кэш на диск, при сетевой ошибке — отдать кэш (без перестройки провайдеров). Локальные документы, ждущие импорта, остаются в индексе до успешной отправки и подмешиваются в историю. Указатель активной тренировки учит различать локальный документ.

**Tech Stack:** Flutter, Riverpod, `mobile/packages/core/lib/src/offline/*`, `mobile/apps/trainer/lib/api/{trainer_client_card,local_workout,offline_providers,active_workout_pointer,active_workout_state}.dart`, `lib/widgets/active_workout_fab.dart`, `lib/screens/clients_screen.dart`.

## Global Constraints

- Рабочее дерево — worktree `C:\Users\shlya\Desktop\Trener_Prod-offline`, ветка `feat/offline-phase1`. НЕ трогать `C:\Users\shlya\Desktop\Trener_Prod`.
- Русский UI, орфографически корректный. Без красного текста (danger — только иконки severity / кнопки реального действия).
- Онлайн-поведение не менять. Офлайн — новая ветка логики.
- `flutter analyze` (apps/trainer) — 0 issues. Тесты: `C:\Users\shlya\flutter\bin\flutter.bat test`.
- commitlint: subject с маленькой буквы после типа.
- Образец кэш-паттерна уже есть: `TrainerWorkoutsApi.fetch` (`trainer_workouts.dart`) — успех пишет в `KvStore`, `isOfflineError` → отдаём кэш, несетевые ошибки пробрасываем. Переиспользуй ЭТОТ подход.

---

### Task 1: Список тренировок клиента доступен офлайн (кэш)

**Files:**
- Modify: `mobile/apps/trainer/lib/api/trainer_client_card.dart` — метод `workouts(String clientId)` в `TrainerClientCardApi`.
- Test: `mobile/apps/trainer/test/client_workouts_cache_test.dart` (создать).

**Interfaces:**
- Consumes: `kvStoreProvider` (из `offline_providers.dart`), `isOfflineError` (core), `KvStore.writeList/readList`.
- Produces: поведение `clientWorkoutsCardProvider` — офлайн отдаёт последний кэш вместо ошибки.

**Дизайн:** Ключ кэша `client_workouts_<clientId>`. Успех сети → записать сырой список записей тренировок → вернуть разобранное. `isOfflineError(e)` → прочитать кэш; есть → вернуть разобранное из него; нет → пробросить. Несетевые ошибки (404/500) — пробрасывать без кэша. Форма кэша — ровно та, что приходит с сервера (чтобы `TWorkout.fromJson` разобрал обратно).

- [ ] **Step 1: Тест** (по образцу `test/workout_detail_cache_test.dart`): успех кэширует; сетевая ошибка отдаёт кэш; сетевая без кэша — бросает; 404 — бросает не заглядывая в кэш.
- [ ] **Step 2: Запустить — упасть.**
- [ ] **Step 3: Реализовать кэш в `workouts()`.**
- [ ] **Step 4: Тесты зелёные + `flutter analyze` 0.**
- [ ] **Step 5: Commit** — `feat(offline): список тренировок клиента доступен офлайн (кэш)`.

---

### Task 2: Завершённая офлайн-тренировка видна в истории до синка

**Files:**
- Modify: `mobile/apps/trainer/lib/api/local_workout.dart` — `LocalWorkoutController.complete()` больше НЕ убирает документ из индекса; добавить `pendingFor(String clientId)` (завершённые, ждущие импорта) и `purge(String id)` (удалить документ + запись индекса).
- Modify: `mobile/apps/trainer/lib/api/offline_providers.dart` — `makeWorkoutImportHandler`: после УСПЕШНОЙ отправки вызвать `purge(id)` (id = `doc['idempotencyKey']`); добавить провайдер `pendingLocalWorkoutsProvider` (family по clientId).
- Modify: `mobile/apps/trainer/lib/screens/clients_screen.dart` — в списке истории подмешать «ждут отправки» локальные записи (пометка «ждёт отправки», нейтральным цветом, БЕЗ красного).
- Test: `mobile/apps/trainer/test/local_workout_test.dart` — дополнить.

**Interfaces:**
- Consumes: `LocalWorkout.toWorkout()`, `activeFor`, `Outbox`.
- Produces: `Future<List<LocalWorkout>> pendingFor(String clientId)`, `Future<void> purge(String id)`, `pendingLocalWorkoutsProvider`.

**Дизайн:** `complete()`: статус `completed`, `_save`, `_indexUpsert` (обновить статус в индексе — НЕ удалять), enqueue `workout.import`. `activeFor` уже фильтрует `status != 'completed'` — «продолжить» не сломается. `pendingFor` возвращает документы со статусом `completed` (ещё в индексе = ещё не отправлены). Обработчик импорта после успеха вызывает `purge` → документ и запись индекса исчезают, дальше история берётся с сервера. Важно: `makeWorkoutImportHandler` сейчас принимает только sender — расширь, чтобы получал и колбэк очистки (инъекция для тестируемости, не тяни провайдеры внутрь).

- [ ] **Step 1: Тест** (`local_workout_test.dart`): после `complete()` документ остаётся в `pendingFor(clientId)` и НЕ в `activeFor`; после `purge(id)` исчезает из обоих.
- [ ] **Step 2: Запустить — упасть.**
- [ ] **Step 3: Реализовать** `complete`/`pendingFor`/`purge` + обработчик с очисткой + провайдер.
- [ ] **Step 4: Подмешать в историю** в `clients_screen.dart` (пометка «ждёт отправки»).
- [ ] **Step 5: Тесты зелёные + analyze 0.**
- [ ] **Step 6: Commit** — `feat(offline): завершённая офлайн-тренировка видна в истории до отправки`.

---

### Task 3: FAB «вернуться к тренировке» для локальной (офлайн) тренировки

**Files:**
- Modify: `mobile/apps/trainer/lib/api/active_workout_pointer.dart` — хранить признак `local`.
- Modify: `mobile/apps/trainer/lib/api/active_workout_state.dart` — `ActiveWorkoutRef` получает `bool local`; `set(...)` принимает `local`; `_hydrate` для локального указателя НЕ ходит на сервер (проверяет наличие локального документа через контроллер, иначе чистит).
- Modify: `mobile/apps/trainer/lib/screens/clients_screen.dart` — `_conductLocal` после создания документа ставит указатель (`local: true`, workoutId = id локального документа).
- Modify: `mobile/apps/trainer/lib/screens/active_workout_screen.dart` — локальный режим: при завершении локальной тренировки чистить указатель (посмотри, как это сделано для серверной, и повтори).
- Modify: `mobile/apps/trainer/lib/widgets/active_workout_fab.dart` — для локального указателя таймер брать из локального документа (не `trainerWorkoutProvider`), тап → открыть `ActiveWorkoutScreen.local(localWorkoutId: aw.workoutId)` через `Navigator` корневого навигатора (маршрут `/active/...` — только для серверной).

**Interfaces:**
- Consumes: `localWorkoutControllerProvider.load(id)` → `LocalWorkout?` (есть `startedAt`), `ActiveWorkoutScreen.local({required String localWorkoutId})`.
- Produces: `ActiveWorkoutRef = ({String clientId, String workoutId, String name, bool local})`.

**Дизайн:** Указатель — единственный источник «идёт тренировка». Для локального: `local: true`, `workoutId` = id локального документа. FAB рисуется тем же бейджем; отличается только источник таймера и способ открытия. Обратная совместимость: сохранённый старый указатель без поля `local` читается как `local: false`.

- [ ] **Step 1:** Расширить указатель + состояние (`local`, дефолт false при чтении старого формата).
- [ ] **Step 2:** Ставить указатель в `_conductLocal`; чистить при завершении локальной тренировки.
- [ ] **Step 3:** Научить FAB локальному режиму (таймер из локального документа, открытие через Navigator).
- [ ] **Step 4:** `flutter analyze` 0; существующие тесты зелёные.
- [ ] **Step 5: Commit** — `feat(offline): FAB возврата к идущей локальной тренировке`.

---

### Task 4: Состояние ошибки при отсутствии связи — облачко + «Нет связи»

**Files:**
- Create: `mobile/apps/trainer/lib/widgets/no_connection_view.dart` — общий виджет пустого/ошибочного состояния.
- Modify: экраны, где сейчас показывается «Не удалось загрузить» в `error:`-ветках `AsyncValue.when` — как минимум `lib/screens/knowledge_screen.dart` (`_err`), `lib/screens/clients_screen.dart` (error-ветки списков/карточек). Найди все такие места: `grep -rn "Не удалось загрузить" mobile/apps/trainer/lib`.

**Interfaces:**
- Produces: `class NoConnectionView extends StatelessWidget { const NoConnectionView({super.key, this.onRetry}); final VoidCallback? onRetry; }`
- Consumes: `isOfflineError` (core).

**Дизайн:** Виджет — по центру: иконка `Icons.cloud_off_outlined` (нейтральный `c.inkMuted`, НЕ красный), под ней текст «Нет связи», ниже — кнопка «Повторить», если передан `onRetry`. В `error:`-ветках: если `isOfflineError(e)` → `NoConnectionView(onRetry: ...)`; иначе — прежнее «Не удалось загрузить» с кнопкой. Тексты и отступы — в стиле существующих пустых состояний (`_empty`/`_err`).

- [ ] **Step 1:** Создать `NoConnectionView`.
- [ ] **Step 2:** Найти все «Не удалось загрузить» и развести по `isOfflineError` (сетевое → облачко «Нет связи», иначе прежний текст).
- [ ] **Step 3:** `flutter analyze` 0; существующие тесты зелёные.
- [ ] **Step 4: Commit** — `feat(offline): состояние «нет связи» с облачком вместо ошибки загрузки`.

---

## Self-Review

- Покрытие жалоб: «у клиента нет тренировок офлайн» → Task 1; «завершённая не в истории» → Task 2; «нет FAB» → Task 3; «вместо „не удалось загрузить“ — облачко и „нет связи“» → Task 4. ✔
- Типы согласованы: `pendingFor`/`purge` (Task 2 Produces) ↔ обработчик/провайдер; `ActiveWorkoutRef.local` (Task 3) ↔ FAB/указатель; `NoConnectionView` (Task 4) ↔ экраны. ✔
- YAGNI: провайдеры не перестраиваем, бэкенд не трогаем. ✔
