# Офлайн Фаза 2 — шаблоны (CRUD) + устойчивое проведение/повтор

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Шаги — чекбоксы `- [ ]`.

**Goal:** Закрыть офлайн-пробелы, на которые жалуется тренер: создание/редактирование/удаление шаблонов в базе знаний офлайн, а также надёжное «Провести»/«Повторить» у клиента при пропадающей связи.

**Architecture:** Расширяем уже готовый офлайн-движок (`Outbox` + `SyncEngine` + `CachedListNotifier`) на домен шаблонов новыми `kind` (`template.create/update/delete`) с оптимистичным обновлением кэша. Для проведения — переводим серверные точки на «network-error fallback → локальный документ», не полагаясь только на флаг online. Бэкенд НЕ трогаем (дубль шаблона при обрыве в момент ответа — редкий и легко удаляется; правка/удаление идемпотентны сами по себе).

**Tech Stack:** Flutter, Riverpod, существующий `mobile/packages/core/lib/src/offline/*`, `mobile/apps/trainer/lib/api/{trainer_catalog,offline_providers,local_workout,trainer_workouts}.dart`.

## Global Constraints

- Рабочее дерево — worktree `C:\Users\shlya\Desktop\Trener_Prod-offline` на ветке `feat/offline-phase1`. НЕ переключать ветки в основном дереве `Trener_Prod` (там идёт фоновый multi-trainer).
- Русский UI, орфографически корректный. Без красного текста (danger только для иконок severity / кнопок реального действия).
- Бэкенд и серверные онлайн-флоу НЕ ломать: онлайн-поведение остаётся прежним, офлайн — новая ветка.
- `flutter analyze` без ошибок; новые файлы под теми же lint-правилами. commitlint: subject с маленькой буквы после типа.
- Тесты гонять в worktree: `C:\Users\shlya\flutter\bin\flutter.bat test` в `mobile/packages/core` и `mobile/apps/trainer`.
- Дубликаты кода избегаем: онлайн-«отправители» (`createTemplate/updateTemplate/deleteTemplate`) переиспользуются как sender'ы обработчиков очереди.

---

### Task 1: Обработчики очереди шаблонов + оптимистичные мутации в TrainerTemplatesNotifier

**Files:**
- Modify: `mobile/apps/trainer/lib/api/trainer_catalog.dart` — добавить в `TrainerTemplatesNotifier` методы `createOffline/updateOffline/deleteOffline` + приватные хелперы записи оптимистичного кэша; добавить фабрики обработчиков (по образцу `makeWorkoutImportHandler`).
- Modify: `mobile/apps/trainer/lib/api/offline_providers.dart` — зарегистрировать `template.create/update/delete` в `handlers` `syncEngineProvider`.
- Test: `mobile/apps/trainer/test/template_offline_test.dart` (создать).

**Interfaces:**
- Consumes: `Outbox.enqueue({kind, payload})`, `drainOnline(Ref)`, `kvStoreProvider`, `outboxProvider`, `trainerCatalogApiProvider`, `trainerCatalogProvider` (каталог для резолва имён упражнений, доступен офлайн из сид/кэша), `isOnlineProvider`.
- Produces (для Task 2):
  - `Future<void> TrainerTemplatesNotifier.createOffline(Map<String,dynamic> body, {String? clientId})`
  - `Future<void> TrainerTemplatesNotifier.updateOffline(String id, Map<String,dynamic> body)`
  - `Future<void> TrainerTemplatesNotifier.deleteOffline(String id)`
  - Обработчики: `SyncHandler makeTemplateCreateHandler(TrainerCatalogApi api)`, `...UpdateHandler`, `...DeleteHandler`.

**Дизайн:**
- Единый путь (и онлайн, и офлайн): оптимистично меняем `state` + кэш (`store.writeList(cacheKey, raw)`), кладём элемент в `Outbox`, вызываем `drainOnline(ref)`. Онлайн — уходит сразу; офлайн — ждёт связи.
- `createOffline`: генерируем клиентский `id` (uuid) для оптимистичной карточки; имена упражнений резолвим из `trainerCatalogProvider.valueOrNull`. Payload очереди: `{'body': {...body,'clientId':clientId}}` (без клиентского id — серверный POST сам присвоит). После УСПЕШНОГО онлайн-слива — `ref.invalidateSelf()` (рефетч заменит клиентскую карточку серверной; офлайн рефетча нет — карточка живёт в кэше до связи).
- `updateOffline`: оптимистично заменяем запись в кэше; payload `{'id':id,'body':body}`. Обработчик PATCH идемпотентен; `404` (шаблон удалён) — считаем отправленным (`markSent`, т.е. обработчик просто возвращается без ошибки при 404).
- `deleteOffline`: оптимистично убираем из кэша; payload `{'id':id}`. Обработчик DELETE; `404` — уже удалён, успех.
- Обработчик отличает «нет сети» (пробрасывает как есть → `SyncEngine` вернёт в pending) от «сервер отверг» (иное). 404 глотаем внутри обработчика (не ошибка).

- [ ] **Step 1: Тест — createOffline кладёт карточку в state+кэш и элемент в очередь**

```dart
// mobile/apps/trainer/test/template_offline_test.dart
import 'package:core/core.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trener_trainer/api/trainer_catalog.dart';
// Используем InMemoryKvStore-двойник + реальный Outbox.

// Псевдо-набросок: проверяем, что после createOffline:
//  - Outbox.list().length == 1 и kind == 'template.create'
//  - кэш 'trainer_templates' содержит новую запись с переданным name.
```

Полную обвязку теста (ProviderContainer с оверрайдами `kvStoreProvider`, стаб `trainerCatalogApiProvider`, стаб каталога) написать по образцу `mobile/packages/core/test/offline/*` и `local_workout_test.dart`.

- [ ] **Step 2: Запустить — упасть (методов ещё нет)**

Run: `C:\Users\shlya\flutter\bin\flutter.bat test test/template_offline_test.dart` в `mobile/apps/trainer`
Expected: FAIL (нет `createOffline`).

- [ ] **Step 3: Реализовать методы + обработчики** (в `trainer_catalog.dart` и `offline_providers.dart`).

- [ ] **Step 4: Тесты зелёные.** Run те же. Expected: PASS.

- [ ] **Step 5: Commit** — `feat(offline): шаблоны create/update/delete через очередь + оптимистичный кэш`.

---

### Task 2: Развести вызовы шаблонов в UI на офлайн-методы

**Files:**
- Modify: `mobile/apps/trainer/lib/screens/knowledge_screen.dart` — `_duplicateTemplate`, `_deleteTemplate` → вызывать `ref.read(trainerTemplatesProvider.notifier).createOffline/deleteOffline`; убрать `catch`-снекбары «не удалось» (офлайн теперь успешен), оставить общий guard.
- Modify: `mobile/apps/trainer/lib/screens/template_edit_screen.dart` — `_save` (create/update) и `_delete` → офлайн-методы нотифайера. Сохранить возврат `StagedWorkout` для `stageDraftForClient` (create-путь) и `nav.pop(true)`.

**Interfaces:** Consumes методы из Task 1. Ничего не Produces.

**Дизайн:** После оптимистичной мутации экран сразу видит изменение (нотифайер обновил `state`) — `ref.invalidate(trainerTemplatesProvider)` больше не нужен на этих путях (но безвреден). Навигация/возвраты не меняются.

- [ ] **Step 1: Переписать `_deleteTemplate` и `_duplicateTemplate`** в knowledge_screen на `notifier.deleteOffline`/`createOffline`.
- [ ] **Step 2: Переписать `_save`/`_delete`** в template_edit_screen на офлайн-методы (create/update/delete).
- [ ] **Step 3: `flutter analyze`** (в `mobile/apps/trainer`) — без ошибок.
- [ ] **Step 4: Commit** — `feat(offline): база знаний — шаблоны создаются/правятся/удаляются офлайн`.

---

### Task 3: Устойчивое «Провести» офлайн — fallback по сетевой ошибке

**Files:**
- Modify: `mobile/apps/trainer/lib/screens/clients_screen.dart` — `_createAndOpen`: обернуть серверный `assignReturningId` в try/catch; при `isOfflineError(e)` — вместо снекбара уйти в `_conductLocal(name, exercises, null)`. Так проведение работает даже когда флаг online не успел стать false.

**Interfaces:** Consumes `isOfflineError` (из `core`), существующий `_conductLocal`.

**Дизайн:** Не полагаемся только на `isOnlineProvider.valueOrNull == false` — если серверный вызов реально упал по сети, бесшовно создаём локальный документ. `_conductPlan` офлайн-гейт оставляем (быстрый путь), fallback — страховка для «мигающей» связи. Для `excluded`-исторических (`_createAndOpen(...excluded:true)`) локального пути нет — там при сетевой ошибке оставить снекбар (постфактум-запись офлайн вне scope Фазы 2).

- [ ] **Step 1:** В `_createAndOpen` добавить `bool excluded` учёт: при `!excluded` и `isOfflineError` → `_conductLocal`; иначе прежний снекбар.
- [ ] **Step 2:** `flutter analyze` чисто.
- [ ] **Step 3: Commit** — `fix(offline): проведение по плану уходит в локальный документ при сетевой ошибке`.

---

### Task 4: Повтор из истории офлайн — кэш детали тренировки + локальный повтор

**Files:**
- Modify: `mobile/apps/trainer/lib/api/trainer_workouts.dart` — метод `fetch(clientId, id)`: после успешной загрузки кэшировать полный `Workout` (raw) под ключом `workout_detail_<id>`; при сетевой ошибке — вернуть из кэша, если есть, иначе пробросить.
- Modify: `mobile/apps/trainer/lib/screens/clients_screen.dart` — `_repeatWorkout` и `_pickHistory`: план строим из `fetch` (теперь отдаёт кэш офлайн); проведение — через `_conductPlan`/`_conductLocal` (а не только `_createAndOpen`), чтобы офлайн-повтор создал локальный документ. Если детали нет ни в сети, ни в кэше — понятное сообщение «Повтор недоступен офлайн для этой тренировки».
- Test: `mobile/apps/trainer/test/workout_detail_cache_test.dart` (создать) — `fetch` кэширует и отдаёт из кэша при сетевой ошибке.

**Interfaces:** Consumes `kvStoreProvider`/`LocalJsonStore`, `isOfflineError`, `_conductLocal`, `_repeatPlan`.

**Дизайн:** Повтор строит план из ФАКТА (`_repeatPlan`), поэтому нужна полная запись. Кэшируем деталь при каждом онлайн-просмотре/повторе; офлайн-повтор доступен для ранее загруженных тренировок. Проведение повтора офлайн идёт локальным документом (не серверный assign).

- [ ] **Step 1: Тест — `fetch` кэширует и отдаёт из кэша при сетевой ошибке.** Написать по образцу существующих API-тестов (стаб `ApiClient`, `InMemoryKvStore`).
- [ ] **Step 2:** Реализовать кэш в `fetch`.
- [ ] **Step 3:** Перевести `_repeatWorkout`/`_pickHistory` на `_conductLocal` при офлайне (fallback по `isOfflineError` вокруг `_createAndOpen`), пустой план → сообщение.
- [ ] **Step 4:** Тесты зелёные; `flutter analyze` чисто.
- [ ] **Step 5: Commit** — `feat(offline): повтор тренировки из истории работает офлайн (кэш детали + локальный документ)`.

---

## Self-Review

- Покрытие: create(#1)/edit+delete(#2) шаблонов — Task 1-2; «Провести не могу» — Task 3; «Повторить» — Task 4. ✔
- Типы: `createOffline/updateOffline/deleteOffline`, `make*Handler` согласованы между Task 1 (Produces) и Task 2/offline_providers (Consumes). ✔
- YAGNI: бэкенд не трогаем; постфактум-история офлайн отложена явно. ✔
- Заглушек нет. ✔
