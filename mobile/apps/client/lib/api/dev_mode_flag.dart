import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Локальное файловое хранилище флага «режим разработчика клиента».
/// Включается вручную в «Помощь с приложением». Когда включён — на экранах
/// появляется плавающая кнопка «Сообщить о проблеме».
class _DevModeFlagStore {
  _DevModeFlagStore._();
  static const String _key = 'client_dev_mode_enabled';

  static Future<bool> read() async {
    final List<Map<String, dynamic>>? list = await LocalJsonStore.instance.readList(_key);
    if (list == null || list.isEmpty) return false;
    return list.first['enabled'] == true;
  }

  static Future<void> write(bool enabled) => LocalJsonStore.instance.writeList(
        _key,
        <Map<String, dynamic>>[
          <String, dynamic>{'enabled': enabled},
        ],
      );
}

/// Реактивный флаг «режим разработчика». Гидратируется из локального хранилища
/// при старте (дефолт false). false никогда не «перезатирает» уже включённый флаг.
class DevModeNotifier extends Notifier<bool> {
  @override
  bool build() {
    _hydrate();
    return false;
  }

  Future<void> _hydrate() async {
    if (await _DevModeFlagStore.read()) state = true;
  }

  /// Установить режим разработчика (вкл/выкл) — сохраняется локально.
  void set(bool value) {
    state = value;
    _DevModeFlagStore.write(value);
  }
}

final NotifierProvider<DevModeNotifier, bool> devModeEnabledProvider =
    NotifierProvider<DevModeNotifier, bool>(DevModeNotifier.new);
