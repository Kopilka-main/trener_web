# Офлайн Фаза 1 — План 2: ядро-движок (`packages/core`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переиспользуемый офлайн-движок в `packages/core`: детект сети (`NetworkStatus`), персистентная очередь записи (`Outbox`), движок синхронизации (`SyncEngine`) и хелпер cache-first чтения (`CachedListNotifier`). Всё покрыто unit-тестами без бэкенда и без сети.

**Architecture:** Компоненты не знают про конкретные домены и HTTP — зависят от инъектируемых абстракций (`KvStore` для персиста, функции достижимости/классификации ошибок, обработчики по `kind`). Логика чистая и тестируемая на фейках; тонкие Riverpod-провайдеры связывают с реальными `LocalJsonStore` / `connectivity_plus` / API.

**Tech Stack:** Dart, Flutter, flutter_riverpod, flutter_test. Новые пакеты: `connectivity_plus`, `uuid`.

## Global Constraints

- Пакет `core` не зависит от `apps/*`; домофонная логика инъектируется.
- Файлы движка живут в `packages/core/lib/src/offline/` и экспортируются из `lib/core.dart`.
- Every unit тестируется на фейках (без path_provider, без сети, без реального dio).
- Не использовать `DefaultCacheManager`/прямые синглтоны внутри тестируемой логики — только инъекция.
- Именование и стиль — как в существующем `core` (см. `TrainerCatalogNotifier` в `apps/trainer/lib/api/trainer_assign.dart` как образец cache-first).

---

### Task 1: `KvStore` + `Outbox` (персистентная очередь записи)

**Files:**

- Create: `packages/core/lib/src/offline/kv_store.dart`
- Create: `packages/core/lib/src/offline/outbox.dart`
- Modify: `packages/core/lib/src/storage/local_json_store.dart` (добавить `implements KvStore`)
- Modify: `packages/core/lib/core.dart` (экспорт)
- Modify: `packages/core/pubspec.yaml` (добавить `uuid`)
- Test: `packages/core/test/offline/outbox_test.dart`

**Interfaces:**

- Produces:
  - `abstract class KvStore { Future<List<Map<String,dynamic>>?> readList(String key); Future<void> writeList(String key, List<Map<String,dynamic>> value); }`
  - `enum OutboxStatus { pending, sending, failed }`
  - `class OutboxItem { String id; String kind; Map<String,dynamic> payload; OutboxStatus status; int attempts; int createdAt; String? lastError; Map<String,dynamic> toJson(); factory OutboxItem.fromJson(...); }`
  - `class Outbox { Outbox(KvStore store, {Uuid uuid, int Function() clock}); Future<List<OutboxItem>> list(); Future<OutboxItem> enqueue({required String kind, required Map<String,dynamic> payload}); Future<void> markSending(String id); Future<void> markSent(String id); Future<void> markFailed(String id, String error); }`
  - `list()` возвращает по возрастанию `createdAt`. `markSent` удаляет элемент. Всё персистится через `KvStore` под ключом `'outbox'`.

- [ ] **Step 1: Добавить `uuid` в pubspec**

В `packages/core/pubspec.yaml` в `dependencies` добавить:

```yaml
uuid: ^4.5.1
```

Run: `cd packages/core && flutter pub get`
Expected: успешно.

- [ ] **Step 2: Написать падающий тест**

Создать `packages/core/test/offline/outbox_test.dart`:

```dart
import 'package:core/core.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeStore implements KvStore {
  final Map<String, List<Map<String, dynamic>>> _data = {};
  @override
  Future<List<Map<String, dynamic>>?> readList(String key) async => _data[key];
  @override
  Future<void> writeList(String key, List<Map<String, dynamic>> value) async =>
      _data[key] = value;
}

void main() {
  late _FakeStore store;
  late Outbox outbox;
  int t = 1000;
  setUp(() {
    store = _FakeStore();
    outbox = Outbox(store, clock: () => t++);
  });

  test('enqueue сохраняет и возвращает элемент в статусе pending', () async {
    final item = await outbox.enqueue(kind: 'workout.import', payload: {'a': 1});
    expect(item.kind, 'workout.import');
    expect(item.status, OutboxStatus.pending);
    final list = await outbox.list();
    expect(list, hasLength(1));
    expect(list.first.payload['a'], 1);
  });

  test('list отсортирован по createdAt по возрастанию', () async {
    final a = await outbox.enqueue(kind: 'k', payload: {'n': 1});
    final b = await outbox.enqueue(kind: 'k', payload: {'n': 2});
    final list = await outbox.list();
    expect(list.map((e) => e.id).toList(), [a.id, b.id]);
  });

  test('markSent удаляет элемент, markFailed помечает failed + attempts', () async {
    final a = await outbox.enqueue(kind: 'k', payload: {});
    await outbox.markFailed(a.id, 'boom');
    var list = await outbox.list();
    expect(list.first.status, OutboxStatus.failed);
    expect(list.first.attempts, 1);
    expect(list.first.lastError, 'boom');
    await outbox.markSent(a.id);
    list = await outbox.list();
    expect(list, isEmpty);
  });

  test('переживает пересоздание (персист в KvStore)', () async {
    await outbox.enqueue(kind: 'k', payload: {'x': 9});
    final revived = Outbox(store);
    final list = await revived.list();
    expect(list, hasLength(1));
    expect(list.first.payload['x'], 9);
  });
}
```

- [ ] **Step 3: Запустить — убедиться, что падает**

Run: `cd packages/core && flutter test test/offline/outbox_test.dart`
Expected: FAIL — `KvStore`/`Outbox` не найдены.

- [ ] **Step 4: Реализовать `KvStore`**

Создать `packages/core/lib/src/offline/kv_store.dart`:

```dart
/// Минимальный ключ-значение стор списков JSON-объектов. Абстракция над
/// файловым `LocalJsonStore` — чтобы офлайн-движок был тестируем на фейке.
abstract class KvStore {
  Future<List<Map<String, dynamic>>?> readList(String key);
  Future<void> writeList(String key, List<Map<String, dynamic>> value);
}
```

В `packages/core/lib/src/storage/local_json_store.dart` — объявить, что синглтон реализует контракт: заменить `class LocalJsonStore {` на `class LocalJsonStore implements KvStore {` и добавить импорт `import '../offline/kv_store.dart';` в шапке. Сигнатуры `readList/writeList` уже совпадают — тела не трогаем.

- [ ] **Step 5: Реализовать `Outbox`**

Создать `packages/core/lib/src/offline/outbox.dart`:

```dart
import 'package:uuid/uuid.dart';

import 'kv_store.dart';

enum OutboxStatus { pending, sending, failed }

/// Один элемент очереди исходящих изменений. [payload] — доменные данные,
/// [kind] выбирает обработчик синка. [id] — клиентский UUID (ключ идемпотентности).
class OutboxItem {
  OutboxItem({
    required this.id,
    required this.kind,
    required this.payload,
    required this.createdAt,
    this.status = OutboxStatus.pending,
    this.attempts = 0,
    this.lastError,
  });

  final String id;
  final String kind;
  final Map<String, dynamic> payload;
  final int createdAt;
  OutboxStatus status;
  int attempts;
  String? lastError;

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'kind': kind,
        'payload': payload,
        'createdAt': createdAt,
        'status': status.name,
        'attempts': attempts,
        'lastError': lastError,
      };

  factory OutboxItem.fromJson(Map<String, dynamic> j) => OutboxItem(
        id: j['id'] as String,
        kind: j['kind'] as String,
        payload: (j['payload'] as Map).cast<String, dynamic>(),
        createdAt: (j['createdAt'] as num).toInt(),
        status: OutboxStatus.values.firstWhere(
          (s) => s.name == j['status'],
          orElse: () => OutboxStatus.pending,
        ),
        attempts: (j['attempts'] as num?)?.toInt() ?? 0,
        lastError: j['lastError'] as String?,
      );
}

/// Персистентная FIFO-очередь исходящих изменений (на диске через [KvStore]).
class Outbox {
  Outbox(this._store, {Uuid uuid = const Uuid(), int Function()? clock})
      : _uuid = uuid,
        _clock = clock ?? (() => DateTime.now().millisecondsSinceEpoch);

  static const String _key = 'outbox';
  final KvStore _store;
  final Uuid _uuid;
  final int Function() _clock;

  Future<List<OutboxItem>> _load() async {
    final raw = await _store.readList(_key) ?? <Map<String, dynamic>>[];
    final items = raw.map(OutboxItem.fromJson).toList()
      ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return items;
  }

  Future<void> _save(List<OutboxItem> items) =>
      _store.writeList(_key, items.map((e) => e.toJson()).toList());

  Future<List<OutboxItem>> list() => _load();

  Future<OutboxItem> enqueue({
    required String kind,
    required Map<String, dynamic> payload,
  }) async {
    final item = OutboxItem(
      id: _uuid.v4(),
      kind: kind,
      payload: payload,
      createdAt: _clock(),
    );
    final items = await _load()..add(item);
    await _save(items);
    return item;
  }

  Future<void> _mutate(String id, void Function(OutboxItem) fn) async {
    final items = await _load();
    final i = items.indexWhere((e) => e.id == id);
    if (i == -1) return;
    fn(items[i]);
    await _save(items);
  }

  Future<void> markSending(String id) =>
      _mutate(id, (it) => it.status = OutboxStatus.sending);

  Future<void> markFailed(String id, String error) => _mutate(id, (it) {
        it.status = OutboxStatus.failed;
        it.attempts += 1;
        it.lastError = error;
      });

  Future<void> markSent(String id) async {
    final items = await _load()..removeWhere((e) => e.id == id);
    await _save(items);
  }
}
```

- [ ] **Step 6: Экспорт из core**

В `packages/core/lib/core.dart` добавить (в блок `export`):

```dart
export 'src/offline/kv_store.dart';
export 'src/offline/outbox.dart';
```

- [ ] **Step 7: Запустить — зелёный + анализ**

Run: `cd packages/core && flutter test test/offline/outbox_test.dart && flutter analyze`
Expected: тесты PASS, `No issues found!`.

- [ ] **Step 8: Коммит**

```bash
git add packages/core/pubspec.yaml packages/core/lib/src/offline/kv_store.dart packages/core/lib/src/offline/outbox.dart packages/core/lib/src/storage/local_json_store.dart packages/core/lib/core.dart packages/core/test/offline/outbox_test.dart
git commit -m "feat(core): KvStore + персистентный Outbox для офлайн-очереди"
```

---

### Task 2: `NetworkStatus` (детект связи)

**Files:**

- Create: `packages/core/lib/src/offline/network_status.dart`
- Modify: `packages/core/lib/core.dart` (экспорт)
- Modify: `packages/core/pubspec.yaml` (добавить `connectivity_plus`)
- Test: `packages/core/test/offline/network_status_test.dart`

**Interfaces:**

- Produces:
  - `class NetworkStatus { NetworkStatus({required Future<bool> Function() hasInterface, required Future<bool> Function() reachable}); Future<bool> isOnline(); }`
  - `isOnline()` = `await hasInterface() && await reachable()` (сеть есть И API реально достижим — случай «Wi-Fi есть, интернета нет»).
  - `final isOnlineProvider = ...` (Riverpod) — определим в Плане 3 при связывании с реальными `connectivity_plus`/API; здесь только тестируемая логика `NetworkStatus`.

- [ ] **Step 1: Добавить `connectivity_plus`**

В `packages/core/pubspec.yaml` в `dependencies`:

```yaml
connectivity_plus: ^6.1.0
```

Run: `cd packages/core && flutter pub get`
Expected: успешно.

- [ ] **Step 2: Написать падающий тест**

Создать `packages/core/test/offline/network_status_test.dart`:

```dart
import 'package:core/core.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('online только когда есть интерфейс И API достижим', () async {
    Future<bool> t() async => true;
    Future<bool> f() async => false;

    expect(await NetworkStatus(hasInterface: t, reachable: t).isOnline(), true);
    expect(await NetworkStatus(hasInterface: t, reachable: f).isOnline(), false);
    expect(await NetworkStatus(hasInterface: f, reachable: t).isOnline(), false);
  });

  test('reachable не вызывается, если интерфейса нет (короткое замыкание)', () async {
    var reachableCalls = 0;
    final ns = NetworkStatus(
      hasInterface: () async => false,
      reachable: () async {
        reachableCalls++;
        return true;
      },
    );
    expect(await ns.isOnline(), false);
    expect(reachableCalls, 0);
  });
}
```

- [ ] **Step 3: Запустить — убедиться, что падает**

Run: `cd packages/core && flutter test test/offline/network_status_test.dart`
Expected: FAIL — `NetworkStatus` не найден.

- [ ] **Step 4: Реализовать**

Создать `packages/core/lib/src/offline/network_status.dart`:

```dart
/// Определяет реальную доступность бэкенда: сеть есть И API отвечает.
/// Зависимости инъектируются, чтобы логику можно было тестировать без сети.
/// Riverpod-провайдер (связка с connectivity_plus и пробой API) — в приложении.
class NetworkStatus {
  NetworkStatus({
    required Future<bool> Function() hasInterface,
    required Future<bool> Function() reachable,
  })  : _hasInterface = hasInterface,
        _reachable = reachable;

  final Future<bool> Function() _hasInterface;
  final Future<bool> Function() _reachable;

  /// true только если есть сетевой интерфейс И бэкенд реально достижим
  /// (важно для «Wi-Fi есть, интернета нет» — частый случай в зале).
  Future<bool> isOnline() async {
    if (!await _hasInterface()) return false;
    return _reachable();
  }
}
```

- [ ] **Step 5: Экспорт + зелёный + анализ**

В `packages/core/lib/core.dart` добавить:

```dart
export 'src/offline/network_status.dart';
```

Run: `cd packages/core && flutter test test/offline/network_status_test.dart && flutter analyze`
Expected: PASS, `No issues found!`.

- [ ] **Step 6: Коммит**

```bash
git add packages/core/pubspec.yaml packages/core/lib/src/offline/network_status.dart packages/core/lib/core.dart packages/core/test/offline/network_status_test.dart
git commit -m "feat(core): NetworkStatus — online = интерфейс + реальная достижимость API"
```

---

### Task 3: `SyncEngine` (слив очереди)

**Files:**

- Create: `packages/core/lib/src/offline/sync_engine.dart`
- Modify: `packages/core/lib/core.dart` (экспорт)
- Test: `packages/core/test/offline/sync_engine_test.dart`

**Interfaces:**

- Consumes: `Outbox` (Task 1) — `list/markSending/markSent/markFailed`.
- Produces:
  - `typedef SyncHandler = Future<void> Function(OutboxItem item);`
  - `class OfflineException implements Exception { OfflineException([this.message]); final String? message; }`
  - `class SyncResult { final int sent; final int failed; final bool stoppedOffline; }`
  - `class SyncEngine { SyncEngine(Outbox outbox, {required Map<String, SyncHandler> handlers, bool Function(Object error)? isOffline}); Future<SyncResult> drain(); }`
  - `drain()` идёт по очереди по порядку: `markSending` → handler → `markSent`; при `OfflineException` (или `isOffline(e)==true`) — вернуть элемент в `pending` (через повторную загрузку) и **прервать** слив (сеть пропала); при прочей ошибке — `markFailed` и **продолжить** (отказ сервера не блокирует остальные).

- [ ] **Step 1: Написать падающий тест**

Создать `packages/core/test/offline/sync_engine_test.dart`:

```dart
import 'package:core/core.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeStore implements KvStore {
  final Map<String, List<Map<String, dynamic>>> _d = {};
  @override
  Future<List<Map<String, dynamic>>?> readList(String k) async => _d[k];
  @override
  Future<void> writeList(String k, List<Map<String, dynamic>> v) async => _d[k] = v;
}

void main() {
  late Outbox outbox;
  setUp(() {
    int t = 0;
    outbox = Outbox(_FakeStore(), clock: () => t++);
  });

  test('сливает по порядку и удаляет отправленные', () async {
    await outbox.enqueue(kind: 'k', payload: {'n': 1});
    await outbox.enqueue(kind: 'k', payload: {'n': 2});
    final seen = <int>[];
    final engine = SyncEngine(outbox, handlers: {
      'k': (item) async => seen.add(item.payload['n'] as int),
    });
    final res = await engine.drain();
    expect(seen, [1, 2]);
    expect(res.sent, 2);
    expect(await outbox.list(), isEmpty);
  });

  test('отказ сервера → failed, но остальные продолжают', () async {
    await outbox.enqueue(kind: 'bad', payload: {});
    await outbox.enqueue(kind: 'ok', payload: {});
    var okDone = false;
    final engine = SyncEngine(outbox, handlers: {
      'bad': (_) async => throw Exception('422'),
      'ok': (_) async => okDone = true,
    });
    final res = await engine.drain();
    expect(okDone, true);
    expect(res.failed, 1);
    final left = await outbox.list();
    expect(left, hasLength(1));
    expect(left.first.status, OutboxStatus.failed);
  });

  test('OfflineException → прерывает слив, элемент остаётся pending', () async {
    await outbox.enqueue(kind: 'net', payload: {});
    await outbox.enqueue(kind: 'net', payload: {});
    var calls = 0;
    final engine = SyncEngine(outbox, handlers: {
      'net': (_) async {
        calls++;
        throw OfflineException();
      },
    });
    final res = await engine.drain();
    expect(calls, 1); // прервались после первого
    expect(res.stoppedOffline, true);
    final left = await outbox.list();
    expect(left, hasLength(2));
    expect(left.first.status, OutboxStatus.pending);
  });
}
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd packages/core && flutter test test/offline/sync_engine_test.dart`
Expected: FAIL — `SyncEngine`/`OfflineException` не найдены.

- [ ] **Step 3: Реализовать**

Создать `packages/core/lib/src/offline/sync_engine.dart`:

```dart
import 'outbox.dart';

/// Обработчик отправки одного элемента очереди на сервер (по kind).
typedef SyncHandler = Future<void> Function(OutboxItem item);

/// Сетевой сбой во время отправки: слив прерывается, элемент остаётся в очереди.
class OfflineException implements Exception {
  OfflineException([this.message]);
  final String? message;
  @override
  String toString() => 'OfflineException(${message ?? ''})';
}

class SyncResult {
  const SyncResult({required this.sent, required this.failed, required this.stoppedOffline});
  final int sent;
  final int failed;
  final bool stoppedOffline;
}

/// Сливает [Outbox] на сервер по порядку. Сетевой сбой прерывает слив
/// (повторим при следующей связи); отказ сервера помечает элемент failed и
/// НЕ блокирует остальные.
class SyncEngine {
  SyncEngine(
    this._outbox, {
    required Map<String, SyncHandler> handlers,
    bool Function(Object error)? isOffline,
  })  : _handlers = handlers,
        _isOffline = isOffline ?? ((e) => e is OfflineException);

  final Outbox _outbox;
  final Map<String, SyncHandler> _handlers;
  final bool Function(Object error) _isOffline;

  Future<SyncResult> drain() async {
    int sent = 0;
    int failed = 0;
    final items = await _outbox.list();
    for (final item in items) {
      if (item.status == OutboxStatus.sending) continue;
      await _outbox.markSending(item.id);
      final handler = _handlers[item.kind];
      if (handler == null) {
        await _outbox.markFailed(item.id, 'Неизвестный тип: ${item.kind}');
        failed++;
        continue;
      }
      try {
        await handler(item);
        await _outbox.markSent(item.id);
        sent++;
      } catch (e) {
        if (_isOffline(e)) {
          // Сеть пропала: вернуть элемент в pending и прервать слив (повторим при
          // следующей связи; attempts не считаем — это не отказ сервера).
          await _outbox.markPending(item.id);
          return SyncResult(sent: sent, failed: failed, stoppedOffline: true);
        }
        await _outbox.markFailed(item.id, '$e');
        failed++;
      }
    }
    return SyncResult(sent: sent, failed: failed, stoppedOffline: false);
  }
}
```

- [ ] **Step 4: Добавить `markPending` в `Outbox`**

`drain()` использует `_outbox.markPending(id)`. Добавить его в
`packages/core/lib/src/offline/outbox.dart` рядом с `markSending`:

```dart
  Future<void> markPending(String id) =>
      _mutate(id, (it) => it.status = OutboxStatus.pending);
```

- [ ] **Step 5: Экспорт + зелёный + анализ**

В `packages/core/lib/core.dart` добавить:

```dart
export 'src/offline/sync_engine.dart';
```

Run: `cd packages/core && flutter test test/offline/sync_engine_test.dart test/offline/outbox_test.dart && flutter analyze`
Expected: все PASS, `No issues found!`.

- [ ] **Step 6: Коммит**

```bash
git add packages/core/lib/src/offline/sync_engine.dart packages/core/lib/src/offline/outbox.dart packages/core/lib/core.dart packages/core/test/offline/sync_engine_test.dart
git commit -m "feat(core): SyncEngine — слив очереди (сеть прерывает, отказ сервера пропускает)"
```

---

### Task 4: `CachedListNotifier` (cache-first чтение)

**Files:**

- Create: `packages/core/lib/src/offline/cached_list_notifier.dart`
- Modify: `packages/core/lib/core.dart` (экспорт)
- Test: `packages/core/test/offline/cached_list_notifier_test.dart`

**Interfaces:**

- Consumes: `KvStore` (Task 1).
- Produces: `abstract class CachedListNotifier<T> extends AsyncNotifier<List<T>>` со слотами `String get cacheKey; KvStore get store; Future<List<Map<String,dynamic>>> fetchRaw(); List<T> parse(List<Map<String,dynamic>> raw);`. `build()` отдаёт кэш мгновенно + фоновое обновление; без кэша — `fetchRaw`; офлайн (fetch падает) — остаётся на кэше. Обобщение `TrainerCatalogNotifier`.

- [ ] **Step 1: Написать падающий тест**

Создать `packages/core/test/offline/cached_list_notifier_test.dart`:

```dart
import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeStore implements KvStore {
  _FakeStore([Map<String, List<Map<String, dynamic>>>? seed]) : _d = seed ?? {};
  final Map<String, List<Map<String, dynamic>>> _d;
  @override
  Future<List<Map<String, dynamic>>?> readList(String k) async => _d[k];
  @override
  Future<void> writeList(String k, List<Map<String, dynamic>> v) async => _d[k] = v;
}

class _TestNotifier extends CachedListNotifier<int> {
  _TestNotifier(this._store, this._fetch);
  final KvStore _store;
  final Future<List<Map<String, dynamic>>> Function() _fetch;
  @override
  String get cacheKey => 'nums';
  @override
  KvStore get store => _store;
  @override
  Future<List<Map<String, dynamic>>> fetchRaw() => _fetch();
  @override
  List<int> parse(List<Map<String, dynamic>> raw) =>
      raw.map((m) => m['v'] as int).toList();
}

void main() {
  test('без кэша — грузит с сервера и пишет в кэш', () async {
    final store = _FakeStore();
    final c = ProviderContainer();
    addTearDown(c.dispose);
    final p = AsyncNotifierProvider<_TestNotifier, List<int>>(
      () => _TestNotifier(store, () async => [
            {'v': 1},
            {'v': 2},
          ]));
    expect(await c.read(p.future), [1, 2]);
    expect(await store.readList('nums'), isNotEmpty);
  });

  test('с кэшем — отдаёт кэш сразу (даже если fetch падает офлайн)', () async {
    final store = _FakeStore({
      'nums': [
        {'v': 7},
      ],
    });
    final c = ProviderContainer();
    addTearDown(c.dispose);
    final p = AsyncNotifierProvider<_TestNotifier, List<int>>(
      () => _TestNotifier(store, () async => throw Exception('offline')));
    expect(await c.read(p.future), [7]);
  });
}
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd packages/core && flutter test test/offline/cached_list_notifier_test.dart`
Expected: FAIL — `CachedListNotifier` не найден.

- [ ] **Step 3: Реализовать**

Создать `packages/core/lib/src/offline/cached_list_notifier.dart`:

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'kv_store.dart';

/// Cache-first загрузка списка: мгновенно отдаёт последнюю копию с диска, в фоне
/// обновляет с сервера; офлайн остаётся на кэше. Обобщение TrainerCatalogNotifier.
abstract class CachedListNotifier<T> extends AsyncNotifier<List<T>> {
  String get cacheKey;
  KvStore get store;

  /// Сырые объекты с сервера (форма, которая кладётся в кэш как есть).
  Future<List<Map<String, dynamic>>> fetchRaw();

  /// Разбор сырых объектов в доменную модель.
  List<T> parse(List<Map<String, dynamic>> raw);

  @override
  Future<List<T>> build() async {
    final cached = await store.readList(cacheKey);
    if (cached != null && cached.isNotEmpty) {
      Future<void>(() => _refresh()); // фоновое обновление, не блокируя выдачу
      return parse(cached);
    }
    return _fetch();
  }

  Future<List<T>> _fetch() async {
    final raw = await fetchRaw();
    await store.writeList(cacheKey, raw);
    return parse(raw);
  }

  Future<void> _refresh() async {
    try {
      state = AsyncData<List<T>>(await _fetch());
    } catch (_) {
      // офлайн — остаёмся на кэше
    }
  }
}
```

- [ ] **Step 4: Экспорт + зелёный + анализ**

В `packages/core/lib/core.dart` добавить:

```dart
export 'src/offline/cached_list_notifier.dart';
```

Run: `cd packages/core && flutter test test/offline/ && flutter analyze`
Expected: все PASS, `No issues found!`.

- [ ] **Step 5: Коммит**

```bash
git add packages/core/lib/src/offline/cached_list_notifier.dart packages/core/lib/core.dart packages/core/test/offline/cached_list_notifier_test.dart
git commit -m "feat(core): CachedListNotifier — cache-first чтение (обобщение каталога)"
```

---

## Итог Плана 2

Готов переиспользуемый офлайн-движок: `Outbox` (персист-очередь), `NetworkStatus` (реальная достижимость), `SyncEngine` (слив с правильной семантикой сеть/сервер), `CachedListNotifier` (cache-first). Всё на unit-тестах, без бэка и сети. Провайдеры (`isOnlineProvider`, `outboxProvider`, `syncEngineProvider`, статус-провайдер) и связка с `connectivity_plus`/реальным API — в Плане 3, там же движок включается в проведение тренировки.
