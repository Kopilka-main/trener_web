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
