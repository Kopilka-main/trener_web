import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Локальное файловое хранилище флага «режим разработчика тренера».
/// Включается один раз, когда тренер соглашается участвовать в разработке
/// (свайп-подтверждение на приз-странице онбординга), и дальше не снимается —
/// на экране появляется плавающая кнопка «Сообщить о проблеме».
class _DevModeFlagStore {
  _DevModeFlagStore._();
  static const String _key = 'trainer_dev_mode_enabled';

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
/// при старте (дефолт false), поднимается в true, когда тренер согласился
/// участвовать в разработке. false никогда не «перезатирает» уже включённый флаг.
class DevModeNotifier extends Notifier<bool> {
  @override
  bool build() {
    _hydrate();
    return false;
  }

  Future<void> _hydrate() async {
    if (await _DevModeFlagStore.read()) state = true;
  }

  /// Включить режим разработчика — сохраняется локально (необратимо).
  void enable() {
    state = true;
    _DevModeFlagStore.write(true);
  }
}

final NotifierProvider<DevModeNotifier, bool> devModeEnabledProvider =
    NotifierProvider<DevModeNotifier, bool>(DevModeNotifier.new);
