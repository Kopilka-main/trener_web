import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Звук при проведении тренировки (бип таймера отдыха: за 10 с и двойной по
/// завершении). По умолчанию включён; значение хранится локально.
class WorkoutSoundController extends StateNotifier<bool> {
  WorkoutSoundController({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage(),
        super(true) {
    _load();
  }
  final FlutterSecureStorage _storage;
  static const String _key = 'workout_sound_enabled';

  Future<void> _load() async {
    try {
      final String? v = await _storage.read(key: _key);
      if (v != null) state = v == '1';
    } catch (_) {
      // нет доступа к хранилищу — остаёмся на дефолте (включено)
    }
  }

  Future<void> setEnabled(bool on) async {
    state = on;
    try {
      await _storage.write(key: _key, value: on ? '1' : '0');
    } catch (_) {
      // молча игнорируем — настройка не сохранится, но сессия продолжит работать
    }
  }
}

final StateNotifierProvider<WorkoutSoundController, bool> workoutSoundEnabledProvider =
    StateNotifierProvider<WorkoutSoundController, bool>((Ref ref) => WorkoutSoundController());
