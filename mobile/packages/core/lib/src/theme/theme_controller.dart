import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const String _themeKey = 'theme_mode';

ThemeMode _themeFromString(String? v) => switch (v) {
      'light' => ThemeMode.light,
      'system' => ThemeMode.system,
      // 'dark' и отсутствие сохранённого выбора → тёмная (тема по умолчанию).
      _ => ThemeMode.dark,
    };

/// Читает сохранённую тему ДО первого кадра (вызывать в main() с await), чтобы
/// приложение сразу рисовалось в нужной теме и не было перескока light→dark.
Future<ThemeMode> loadThemeMode() async {
  try {
    final String? v = await const FlutterSecureStorage().read(key: _themeKey);
    return _themeFromString(v);
  } catch (_) {
    return ThemeMode.dark;
  }
}

/// Начальная тема для первого кадра. По умолчанию тёмная; в main() переопределяется
/// уже загруженным значением (см. [loadThemeMode]) — поэтому перескока темы нет.
final Provider<ThemeMode> initialThemeModeProvider =
    Provider<ThemeMode>((Ref ref) => ThemeMode.dark);

/// Выбор темы пользователем (по умолчанию тёмная). Начальное
/// значение берётся из [initialThemeModeProvider]. system — следовать системной.
class ThemeController extends StateNotifier<ThemeMode> {
  ThemeController(super.initial, {FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  Future<void> set(ThemeMode mode) async {
    state = mode;
    try {
      await _storage.write(key: _themeKey, value: mode.name);
    } catch (_) {
      // best-effort
    }
  }
}

final StateNotifierProvider<ThemeController, ThemeMode> themeModeProvider =
    StateNotifierProvider<ThemeController, ThemeMode>(
  (Ref ref) => ThemeController(ref.read(initialThemeModeProvider)),
);
