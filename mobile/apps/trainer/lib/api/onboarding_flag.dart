import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Локальное файловое хранилище флага «показать онбординг новому тренеру».
/// Ставится ОДИН раз при успешной регистрации, снимается после прохождения
/// приветственной карусели. Существующие пользователи (просто логин) флаг не
/// получают — онбординг не видят.
class _OnboardingFlagStore {
  _OnboardingFlagStore._();
  static const String _key = 'trainer_onboarding_pending';

  static Future<bool> read() async {
    final List<Map<String, dynamic>>? list = await LocalJsonStore.instance.readList(_key);
    if (list == null || list.isEmpty) return false;
    return list.first['pending'] == true;
  }

  static Future<void> write(bool pending) => LocalJsonStore.instance.writeList(
        _key,
        <Map<String, dynamic>>[
          <String, dynamic>{'pending': pending},
        ],
      );
}

/// Реактивный флаг «показать онбординг». Гидратируется из локального хранилища
/// при старте (дефолт false — существующие пользователи карусель не видят),
/// поднимается в true при регистрации и снимается по завершении онбординга.
class OnboardingPendingNotifier extends Notifier<bool> {
  @override
  bool build() {
    _hydrate();
    return false;
  }

  Future<void> _hydrate() async {
    // Поднимаем флаг, только если он реально сохранён — false никогда не
    // «перезатирает» уже установленный setPending().
    if (await _OnboardingFlagStore.read()) state = true;
  }

  /// Пометить онбординг к показу. Вызывается при успешной регистрации нового
  /// тренера (не при логине).
  void setPending() {
    state = true;
    _OnboardingFlagStore.write(true);
  }

  /// Онбординг пройден или пропущен — больше не показывать.
  void complete() {
    state = false;
    _OnboardingFlagStore.write(false);
  }
}

final NotifierProvider<OnboardingPendingNotifier, bool> onboardingPendingProvider =
    NotifierProvider<OnboardingPendingNotifier, bool>(OnboardingPendingNotifier.new);
