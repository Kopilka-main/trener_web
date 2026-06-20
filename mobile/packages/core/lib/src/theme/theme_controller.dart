import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Выбор темы пользователем (по умолчанию светлая — как в вебе). Сохраняется
/// между запусками. system — следовать системной теме устройства.
class ThemeController extends StateNotifier<ThemeMode> {
  ThemeController(this._storage) : super(ThemeMode.light) {
    _load();
  }

  final FlutterSecureStorage _storage;
  static const String _key = 'theme_mode';

  Future<void> _load() async {
    try {
      final String? v = await _storage.read(key: _key);
      state = switch (v) {
        'dark' => ThemeMode.dark,
        'system' => ThemeMode.system,
        _ => ThemeMode.light,
      };
    } catch (_) {
      // нет доступа к хранилищу — остаёмся на светлой
    }
  }

  Future<void> set(ThemeMode mode) async {
    state = mode;
    try {
      await _storage.write(key: _key, value: mode.name);
    } catch (_) {
      // best-effort
    }
  }
}

final StateNotifierProvider<ThemeController, ThemeMode> themeModeProvider =
    StateNotifierProvider<ThemeController, ThemeMode>(
  (ref) => ThemeController(const FlutterSecureStorage()),
);
