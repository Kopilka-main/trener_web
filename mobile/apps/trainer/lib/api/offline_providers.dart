import 'dart:async';

import 'package:async/async.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'local_workout.dart';
import 'trainer_catalog.dart';
import 'trainer_workouts.dart';

/// Обработчик элемента 'workout.import': достаёт clientId+doc и шлёт через
/// sender; после УСПЕШНОЙ отправки зовёт purge(id) — убрать локальный
/// документ (дальше история берётся с сервера). sender и purge инъектируются
/// по отдельности для тестируемости (провайдеры внутрь фабрики не тянем).
SyncHandler makeWorkoutImportHandler(
  Future<void> Function(String clientId, Map<String, dynamic> doc) sender,
  Future<void> Function(String id) purge,
) {
  return (OutboxItem item) async {
    final clientId = item.payload['clientId'] as String;
    final doc = (item.payload['doc'] as Map).cast<String, dynamic>();
    await sender(clientId, doc);
    await purge(doc['idempotencyKey'] as String);
  };
}

final kvStoreProvider = Provider<KvStore>((ref) => LocalJsonStore.instance);

final outboxProvider = Provider<Outbox>((ref) => Outbox(ref.read(kvStoreProvider)));

final localWorkoutControllerProvider = Provider<LocalWorkoutController>(
  (ref) => LocalWorkoutController(ref.read(kvStoreProvider), ref.read(outboxProvider)),
);

/// Активные локальные документы клиента (для карточки «продолжить»). Пересчёт —
/// по инвалидации после создания/завершения проведения.
final localWorkoutsProvider = FutureProvider.family<List<LocalWorkout>, String>(
  (ref, String clientId) => ref.read(localWorkoutControllerProvider).activeFor(clientId),
);

/// Завершённые локальные документы клиента, ещё ждущие отправки (импорта) —
/// подмешиваются в историю до синка (см. `LocalWorkoutController.pendingFor`).
final pendingLocalWorkoutsProvider = FutureProvider.family<List<LocalWorkout>, String>(
  (ref, String clientId) => ref.read(localWorkoutControllerProvider).pendingFor(clientId),
);

/// online = есть сетевой интерфейс И бэкенд реально отвечает. Пересчёт при смене
/// connectivity и раз в 20 c (на случай «Wi-Fi есть, интернета нет»).
final isOnlineProvider = StreamProvider<bool>((ref) async* {
  final api = ref.read(apiClientProvider);
  Future<bool> reachable() async {
    try {
      // Любой ответ (даже 401/404) = сервер достижим. Ошибка сети → офлайн.
      await api.getJson('/api/ping');
      return true;
    } catch (e) {
      return !isOfflineError(e);
    }
  }

  final ns = NetworkStatus(
    hasInterface: () async =>
        !(await Connectivity().checkConnectivity()).contains(ConnectivityResult.none),
    reachable: reachable,
  );

  yield await ns.isOnline();
  final sub = Connectivity().onConnectivityChanged;
  final ticker = Stream<void>.periodic(const Duration(seconds: 20));
  await for (final _ in StreamGroup.merge<void>([sub.map((_) {}), ticker])) {
    final online = await ns.isOnline();
    yield online;
    if (online) unawaited(drainOnline(ref));
  }
});

final syncEngineProvider = Provider<SyncEngine>((ref) {
  final api = ref.read(trainerWorkoutsApiProvider);
  final catalogApi = ref.read(trainerCatalogApiProvider);
  return SyncEngine(
    ref.read(outboxProvider),
    isOffline: isOfflineError,
    handlers: {
      'workout.import': makeWorkoutImportHandler(
        api.importWorkout,
        ref.read(localWorkoutControllerProvider).purge,
      ),
      'template.create': makeTemplateCreateHandler(catalogApi),
      'template.update': makeTemplateUpdateHandler(catalogApi),
      'template.delete': makeTemplateDeleteHandler(catalogApi),
    },
  );
});

/// Число ЖИВЫХ элементов в очереди (для индикатора «N ждут отправки»).
/// Dead-letter (отравленные, см. [SyncEngine.isDeadLetter]) не считаем: слив
/// их больше никогда не тронет, и они не должны вечно висеть в индикаторе.
final syncStatusProvider = FutureProvider<int>((ref) async {
  ref.watch(_syncTick);
  return ref.read(syncEngineProvider).countLive();
});

// Тик для перечитывания статуса после enqueue/слива.
final _syncTick = StateProvider<int>((ref) => 0);

/// Слить очередь (при online и после enqueue). Обновляет индикатор.
Future<void> drainOnline(Ref ref) async {
  await ref.read(syncEngineProvider).drain();
  ref.read(_syncTick.notifier).state++;
  ref.invalidate(syncStatusProvider);
}
