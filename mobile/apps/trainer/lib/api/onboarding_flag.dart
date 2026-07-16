import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// Локальное хранилище: номер сборки, на котором тренер уже видел онбординг.
/// Онбординг показывается, если текущая сборка приложения отличается от
/// сохранённой (новая установка ИЛИ обновление) — то есть один раз после
/// КАЖДОГО обновления, всем пользователям (а не только новым при регистрации).
class _OnboardingFlagStore {
  _OnboardingFlagStore._();
  static const String _key = 'trainer_onboarding_seen_build';

  static Future<String?> readSeenBuild() async {
    final List<Map<String, dynamic>>? list = await LocalJsonStore.instance.readList(_key);
    if (list == null || list.isEmpty) return null;
    return list.first['build'] as String?;
  }

  static Future<void> writeSeenBuild(String build) => LocalJsonStore.instance.writeList(
        _key,
        <Map<String, dynamic>>[
          <String, dynamic>{'build': build},
        ],
      );
}

/// Текущий номер сборки приложения (`buildNumber`, напр. «16» из 1.4.0+16).
/// Пусто, если определить не удалось — тогда онбординг не навязываем.
Future<String> _currentBuild() async {
  try {
    final PackageInfo info = await PackageInfo.fromPlatform();
    return info.buildNumber;
  } catch (_) {
    return '';
  }
}

/// Реактивный флаг «показать онбординг». По умолчанию false; при старте
/// поднимается в true, если текущая сборка приложения ещё не «видела» онбординг
/// (новая установка или обновление). Снимается по завершении карусели с
/// запоминанием текущей сборки — до следующего обновления больше не показывается.
class OnboardingPendingNotifier extends Notifier<bool> {
  @override
  bool build() {
    _hydrate();
    return false;
  }

  Future<void> _hydrate() async {
    final String current = await _currentBuild();
    if (current.isEmpty) return; // не смогли определить сборку — не навязываемся
    final String? seen = await _OnboardingFlagStore.readSeenBuild();
    // Показываем, если на ТЕКУЩЕЙ сборке онбординг ещё не проходили.
    if (seen != current) state = true;
  }

  /// Показать немедленно (успешная регистрация нового тренера).
  void setPending() => state = true;

  /// Онбординг пройден/пропущен на текущей сборке — до следующего обновления
  /// больше не показывать. Запоминаем текущий номер сборки.
  Future<void> complete() async {
    state = false;
    final String current = await _currentBuild();
    if (current.isNotEmpty) await _OnboardingFlagStore.writeSeenBuild(current);
  }
}

final NotifierProvider<OnboardingPendingNotifier, bool> onboardingPendingProvider =
    NotifierProvider<OnboardingPendingNotifier, bool>(OnboardingPendingNotifier.new);
