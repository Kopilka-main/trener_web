import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Скрытие (размытие) финансовых сумм на главном экране тренера — чтобы
/// демонстрировать приложение коллегам, не показывая реальные суммы.
/// По умолчанию выключено; значение хранится локально.
class FinancePrivacyController extends StateNotifier<bool> {
  FinancePrivacyController({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage(),
        super(false) {
    _load();
  }
  final FlutterSecureStorage _storage;
  static const String _key = 'finance_hidden';

  Future<void> _load() async {
    try {
      final String? v = await _storage.read(key: _key);
      if (v != null) state = v == '1';
    } catch (_) {
      // нет доступа к хранилищу — остаёмся на дефолте (выключено)
    }
  }

  Future<void> setHidden(bool on) async {
    state = on;
    try {
      await _storage.write(key: _key, value: on ? '1' : '0');
    } catch (_) {
      // молча игнорируем — настройка не сохранится, но сессия продолжит работать
    }
  }
}

final StateNotifierProvider<FinancePrivacyController, bool> financeHiddenProvider =
    StateNotifierProvider<FinancePrivacyController, bool>((Ref ref) => FinancePrivacyController());
