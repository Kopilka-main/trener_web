import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Персистентное состояние «увиденных» клиентских уведомлений.
/// Зеркало тренерского `TrainerNotifNotifier` (см. trainer_notifications.dart):
///  • seen — помечаются при заходе на экран уведомлений; служат индикатором
///    непросмотренного (кружок у карточки, id которой ещё не в seen).
/// Множество персистится через LocalJsonStore (как localStorage в вебе).
const String _seenKey = 'client_notifications_seen';

/// Notifier с синхронным чтением множества (после гидрации из файла на старте).
class ClientNotifNotifier extends Notifier<Set<String>> {
  final LocalJsonStore _store = LocalJsonStore.instance;

  @override
  Set<String> build() {
    // Гидратируем асинхронно; до загрузки — пустое множество (как localStorage,
    // которого ещё нет). Когда файл прочитан — обновим state.
    _hydrate();
    return <String>{};
  }

  Future<void> _hydrate() async {
    state = await _readSet(_seenKey);
  }

  Future<Set<String>> _readSet(String key) async {
    final List<Map<String, dynamic>>? raw = await _store.readList(key);
    if (raw == null) return <String>{};
    return <String>{
      for (final Map<String, dynamic> m in raw)
        if (m['id'] is String) m['id'] as String,
    };
  }

  Future<void> _writeSet(String key, Set<String> ids) => _store.writeList(
        key,
        <Map<String, dynamic>>[for (final String id in ids) <String, dynamic>{'id': id}],
      );

  /// Пометить набор id «увиденными» (заход на экран уведомлений).
  void markSeen(Iterable<String> ids) {
    final Set<String> next = <String>{...state, ...ids};
    if (next.length == state.length) return;
    state = next;
    _writeSet(_seenKey, next);
  }
}

final NotifierProvider<ClientNotifNotifier, Set<String>> clientNotifSeenProvider =
    NotifierProvider<ClientNotifNotifier, Set<String>>(ClientNotifNotifier.new);
