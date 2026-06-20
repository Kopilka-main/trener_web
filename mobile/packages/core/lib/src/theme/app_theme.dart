import 'package:flutter/material.dart';

/// Бренд-акценты приложений (как в вебе): тренер — лайм, клиент — розовый.
class AppAccents {
  static const Color trainer = Color(0xFFCAFF3A);
  static const Color client = Color(0xFFF72585);
}

/// Тёмная тема с заданным акцентом. Фирменный вид + материал-3 как база;
/// нативные жесты/переходы навешиваются на уровне приложений.
ThemeData buildAppTheme(Color accent) {
  const Color bg = Color(0xFF0B0C10);
  const Color card = Color(0xFF15171E);
  final ColorScheme scheme = ColorScheme.fromSeed(
    seedColor: accent,
    brightness: Brightness.dark,
  ).copyWith(primary: accent, surface: card);
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: bg,
    colorScheme: scheme,
  );
}
