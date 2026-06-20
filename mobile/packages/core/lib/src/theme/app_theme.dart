import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Токены дизайн-системы «GYM Acid Flow» — зеркало packages/theme/theme.css.
/// Светлая тема по умолчанию (тёплый белый + розовый акцент); тёмная — кислотный
/// лайм. Доступны через `Theme.of(context).extension<AppColors>()` либо
/// `context.colors`. Один и тот же набор токенов для клиента и тренера.
@immutable
class AppColors extends ThemeExtension<AppColors> {
  const AppColors({
    required this.canvas,
    required this.bg,
    required this.card,
    required this.cardElevated,
    required this.chip,
    required this.line,
    required this.lineStrong,
    required this.ink,
    required this.inkMuted,
    required this.inkMutedXl,
    required this.accent,
    required this.accentOn,
    required this.success,
    required this.danger,
    required this.coral,
    required this.amber,
    required this.brightness,
  });

  final Color canvas;
  final Color bg;
  final Color card;
  final Color cardElevated;
  final Color chip;
  final Color line;
  final Color lineStrong;
  final Color ink;
  final Color inkMuted;
  final Color inkMutedXl;
  final Color accent;
  final Color accentOn;
  final Color success;
  final Color danger;
  final Color coral;
  final Color amber;
  final Brightness brightness;

  static const AppColors light = AppColors(
    canvas: Color(0xFFE7E8EC),
    bg: Color(0xFFF5F5F4),
    card: Color(0xFFFFFFFF),
    cardElevated: Color(0xFFECEEF1),
    chip: Color(0xFFE9EBEF),
    line: Color(0x1A000000),
    lineStrong: Color(0x29000000),
    ink: Color(0xFF16181D),
    inkMuted: Color(0xFF5B606B),
    inkMutedXl: Color(0xFF949AA4),
    accent: Color(0xFFF72585),
    accentOn: Color(0xFFFFFFFF),
    success: Color(0xFF4E7A1E),
    danger: Color(0xFFD83A1E),
    coral: Color(0xFFF05638),
    amber: Color(0xFFD89A1C),
    brightness: Brightness.light,
  );

  static const AppColors dark = AppColors(
    canvas: Color(0xFF000000),
    bg: Color(0xFF0B0C10),
    card: Color(0xFF15171D),
    cardElevated: Color(0xFF1D2029),
    chip: Color(0xFF1F2128),
    line: Color(0x1AFFFFFF),
    lineStrong: Color(0x33FFFFFF),
    ink: Color(0xFFEEEEE8),
    inkMuted: Color(0xFF9A9DA6),
    inkMutedXl: Color(0xFF5E626B),
    accent: Color(0xFFD4FF3D),
    accentOn: Color(0xFF0B0C10),
    success: Color(0xFF5C7A0E),
    danger: Color(0xFFE04A2E),
    coral: Color(0xFFFF6E4E),
    amber: Color(0xFFE8B255),
    brightness: Brightness.dark,
  );

  @override
  AppColors copyWith({Brightness? brightness}) => this;

  // Тему переключаем мгновенно (без интерполяции токенов) — снап к целевой.
  @override
  AppColors lerp(ThemeExtension<AppColors>? other, double t) {
    if (other is! AppColors) return this;
    return t < 0.5 ? this : other;
  }
}

/// Доступ к токенам из виджета: `context.colors.accent`.
extension AppColorsX on BuildContext {
  AppColors get colors => Theme.of(this).extension<AppColors>() ?? AppColors.light;
}

/// Фирменные шрифты (как в вебе): display — Bowlby One (крупные числа/заголовки),
/// mono — JetBrains Mono (метки/время), основной текст — Space Grotesk.
abstract final class AppFonts {
  static TextStyle display({
    required double size,
    Color? color,
    double height = 1,
    double letterSpacing = -0.5,
  }) =>
      GoogleFonts.bowlbyOne(
        fontSize: size,
        color: color,
        height: height,
        letterSpacing: letterSpacing,
      );

  static TextStyle mono({
    required double size,
    Color? color,
    FontWeight weight = FontWeight.w700,
    double letterSpacing = 0.5,
    double height = 1.1,
  }) =>
      GoogleFonts.jetBrainsMono(
        fontSize: size,
        color: color,
        fontWeight: weight,
        letterSpacing: letterSpacing,
        height: height,
      );
}

/// Собирает ThemeData из набора токенов (light/dark). Основной шрифт — Space Grotesk.
ThemeData buildAppTheme(AppColors c) {
  final ColorScheme scheme = ColorScheme(
    brightness: c.brightness,
    primary: c.accent,
    onPrimary: c.accentOn,
    secondary: c.accent,
    onSecondary: c.accentOn,
    error: c.danger,
    onError: Colors.white,
    surface: c.card,
    onSurface: c.ink,
    surfaceContainerHighest: c.cardElevated,
    onSurfaceVariant: c.inkMuted,
    outline: c.lineStrong,
    outlineVariant: c.line,
  );

  final TextTheme base = GoogleFonts.spaceGroteskTextTheme(
    c.brightness == Brightness.dark ? ThemeData.dark().textTheme : ThemeData.light().textTheme,
  ).apply(bodyColor: c.ink, displayColor: c.ink);

  return ThemeData(
    useMaterial3: true,
    brightness: c.brightness,
    scaffoldBackgroundColor: c.bg,
    colorScheme: scheme,
    textTheme: base,
    extensions: <ThemeExtension<dynamic>>[c],
    appBarTheme: AppBarTheme(
      backgroundColor: c.bg,
      foregroundColor: c.ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: GoogleFonts.spaceGrotesk(
        fontSize: 20,
        fontWeight: FontWeight.w700,
        color: c.ink,
      ),
    ),
    cardTheme: CardThemeData(
      color: c.card,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: c.line),
      ),
      margin: EdgeInsets.zero,
    ),
    dividerTheme: DividerThemeData(color: c.line, thickness: 1, space: 1),
    chipTheme: ChipThemeData(
      backgroundColor: c.chip,
      side: BorderSide(color: c.line),
      labelStyle: TextStyle(color: c.inkMuted, fontWeight: FontWeight.w600),
    ),
  );
}
