import 'package:core/core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Локальный флаг «показать онбординг-QR один раз после регистрации».
/// Ставится при УСПЕШНОЙ регистрации ([setPending]), снимается по завершении
/// экрана онбординга ([complete]). Персистится через LocalJsonStore (как
/// localStorage в вебе), чтобы пережить перезапуск приложения до первого показа.
/// Существующие пользователи (логин) флага не имеют — онбординг не увидят.
const String _pendingKey = 'client_onboarding_pending';

/// Notifier с синхронным чтением флага (после гидрации из файла на старте).
class OnboardingPendingNotifier extends Notifier<bool> {
  final LocalJsonStore _store = LocalJsonStore.instance;

  @override
  bool build() {
    // Гидратируем асинхронно; до чтения файла — false (дефолт: онбординг скрыт).
    // Когда файл прочитан и там pending=true — поднимем флаг.
    _hydrate();
    return false;
  }

  Future<void> _hydrate() async {
    final List<Map<String, dynamic>>? raw = await _store.readList(_pendingKey);
    final bool pending = raw != null && raw.isNotEmpty && raw.first['pending'] == true;
    // Только поднимаем флаг: если к моменту гидрации setPending() уже вызван
    // (регистрация в этой же сессии), старое значение из файла его не затрёт.
    if (pending) state = true;
  }

  Future<void> _write(bool value) => _store.writeList(
        _pendingKey,
        <Map<String, dynamic>>[<String, dynamic>{'pending': value}],
      );

  /// Отметить онбординг «ожидающим показа» — вызывается после успешной регистрации.
  void setPending() {
    state = true;
    _write(true);
  }

  /// Онбординг показан — больше не показывать (по кнопке «Готово»).
  void complete() {
    state = false;
    _write(false);
  }
}

final NotifierProvider<OnboardingPendingNotifier, bool> onboardingPendingProvider =
    NotifierProvider<OnboardingPendingNotifier, bool>(OnboardingPendingNotifier.new);
