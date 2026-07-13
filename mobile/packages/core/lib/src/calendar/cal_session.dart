import 'package:flutter/material.dart';

/// Статус занятия и подтверждение клиентом — общий контракт для календаря
/// (зеркало sessionStatus / clientConfirmation из @trener/shared).
enum CalStatus { planned, completed, cancelled }

enum CalConfirmation { pending, confirmed, declined }

/// Минимальное представление занятия, нужное календарю. Клиентское и тренерское
/// приложения мапят свои модели в этот тип.
class CalSession {
  const CalSession({
    required this.id,
    required this.date,
    required this.startTime,
    required this.durationMin,
    required this.isOnline,
    required this.location,
    required this.label,
    required this.status,
    required this.confirmation,
    this.dimmed = false,
  });

  final String id;
  final String date; // YYYY-MM-DD
  final String startTime; // HH:MM
  final int durationMin;
  final bool isOnline;
  final String? location;
  final String label; // title ?? имя ?? 'Занятие'
  final CalStatus status;
  final CalConfirmation confirmation;
  // Чужое занятие (не сфокусированного клиента) в скоуп-календаре — рисуем серым.
  final bool dimmed;

  int get startMin => calTimeToMin(startTime);
  String get endTime => calEndTime(startTime, durationMin);
}

// ─── Цвета блока занятия (мягкие «айфоновские» тона, зависят от темы) ───
class CalTileColors {
  const CalTileColors(this.bg, this.fg, this.accent,
      {this.strike = false, this.faded = false});
  final Color bg; // мягкая tint-подложка плитки
  final Color fg; // читаемый цветной текст поверх подложки
  final Color accent; // насыщенный статус-цвет (рамка, акценты)
  final bool strike;
  final bool faded;
}

/// Палитра статусов календаря (общий источник для плиток и легенды):
/// красный — несогласованная (ожидает/отклонена), жёлтый — согласованная но не
/// проведённая, зелёный — проведённая.
const Color kCalUnconfirmed = Color(0xFFFF5A5A); // красный
const Color kCalConfirmed = Color(0xFFFFD60A); // жёлтый
const Color kCalCompleted = Color(0xFF34C759); // зелёный

/// Мягкие тона плитки по статусу (как в iOS-календаре): tint-подложка +
/// читаемый цветной текст + насыщенная рамка. Смысл статусов сохранён
/// (красный/жёлтый/зелёный). [surface] — фон, поверх которого подмешивается
/// tint; [mutedFg] — серый для отменённых/чужих; [dark] — тёмная ли тема.
/// cancelled→серый перечёркнутый; completed→зелёный (терминальное, перебивает
/// подтверждение); confirmed→жёлтый; ожидает/отклонена→красный.
CalTileColors calTileColors(
  CalSession s,
  Color surface,
  Color mutedFg, {
  required bool dark,
}) {
  if (s.dimmed) {
    // Чужое занятие (не этого клиента) — приглушённо-серое, поверх статуса.
    return CalTileColors(surface, mutedFg, mutedFg, faded: true);
  }
  if (s.status == CalStatus.cancelled) {
    return CalTileColors(surface, mutedFg, mutedFg, strike: true, faded: true);
  }
  late final Color hue;
  late final Color fg;
  if (s.status == CalStatus.completed) {
    hue = kCalCompleted;
    fg = dark ? const Color(0xFF6FE08C) : const Color(0xFF1B7A3D);
  } else if (s.confirmation == CalConfirmation.confirmed) {
    hue = kCalConfirmed;
    fg = dark ? const Color(0xFFFFDE5C) : const Color(0xFF8A6A00);
  } else {
    // Несогласованная (ожидает ответа или отклонена) — красный.
    hue = kCalUnconfirmed;
    fg = dark ? const Color(0xFFFF9490) : const Color(0xFFB3261E);
  }
  // Подмешиваем насыщенный цвет к фону: получается мягкий пастельный tint,
  // непрозрачный (перекрывает линии сетки в дневном виде).
  final Color bg =
      Color.alphaBlend(hue.withValues(alpha: dark ? 0.24 : 0.18), surface);
  return CalTileColors(bg, fg, hue);
}

// ─── Утилиты дат (локальная зона), зеркало apps/web-client/src/lib/calendar.ts ───
const List<String> calDayShort = <String>['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const List<String> calDayFull = <String>[
  'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье',
];
const List<String> calMonthFull = <String>[
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
const List<String> calMonthGen = <String>[
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/// Окно времени дневной сетки — полные сутки.
const int calStartHour = 0;
const int calHours = 24;

String calIsoDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

DateTime calParseIso(String s) {
  final List<String> p = s.split('-');
  return DateTime(
    int.tryParse(p.isNotEmpty ? p[0] : '') ?? 1970,
    p.length > 1 ? int.tryParse(p[1]) ?? 1 : 1,
    p.length > 2 ? int.tryParse(p[2]) ?? 1 : 1,
  );
}

DateTime calAddDays(DateTime d, int n) => DateTime(d.year, d.month, d.day + n);
DateTime calAddMonths(DateTime d, int n) => DateTime(d.year, d.month + n, d.day);

/// Индекс дня недели с понедельника (0..6).
int calWeekdayMon(DateTime d) => (d.weekday - 1) % 7;

DateTime calStartOfWeek(DateTime d) => calAddDays(d, -calWeekdayMon(d));

List<DateTime> calWeekDates(DateTime anchor) {
  final DateTime start = calStartOfWeek(anchor);
  return List<DateTime>.generate(7, (int i) => calAddDays(start, i));
}

/// Сетка месяца 6×7, начиная с понедельника.
List<DateTime> calMonthGrid(DateTime anchor) {
  final DateTime first = DateTime(anchor.year, anchor.month, 1);
  final DateTime start = calStartOfWeek(first);
  return List<DateTime>.generate(42, (int i) => calAddDays(start, i));
}

bool calSameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

int calTimeToMin(String t) {
  final List<String> p = t.split(':');
  return (int.tryParse(p.isNotEmpty ? p[0] : '') ?? 0) * 60 +
      (p.length > 1 ? int.tryParse(p[1]) ?? 0 : 0);
}

String calEndTime(String startTime, int durationMin) {
  final int total = calTimeToMin(startTime) + durationMin;
  final int eh = (total ~/ 60) % 24;
  final int em = total % 60;
  return '${eh.toString().padLeft(2, '0')}:${em.toString().padLeft(2, '0')}';
}

String calHumanDuration(int min) {
  final int h = min ~/ 60;
  final int m = min % 60;
  if (h == 0) return '$m мин';
  if (m == 0) return '$h ч';
  return '$h ч $m мин';
}

/// Занятия конкретного дня, отсортированы по времени начала.
List<CalSession> calSessionsOf(List<CalSession> all, DateTime d) {
  final String iso = calIsoDate(d);
  final List<CalSession> list = all.where((CalSession s) => s.date == iso).toList();
  list.sort((CalSession a, CalSession b) => a.startTime.compareTo(b.startTime));
  return list;
}

/// Раскладка пересекающихся занятий по колонкам (как layoutColumns в вебе):
/// возвращает для каждого id пару (колонка, всего колонок в кластере).
Map<String, ({int col, int cols})> calLayoutColumns(List<CalSession> items) {
  final Map<String, ({int col, int cols})> res = <String, ({int col, int cols})>{};
  final List<({String id, int start, int end})> ivs = items
      .map((CalSession s) => (id: s.id, start: s.startMin, end: s.startMin + (s.durationMin > 1 ? s.durationMin : 1)))
      .toList()
    ..sort((a, b) => a.start != b.start ? a.start - b.start : a.end - b.end);

  List<({String id, int start, int end})> cluster = <({String id, int start, int end})>[];
  int clusterEnd = -1;
  void flush() {
    final List<int> colEnds = <int>[];
    for (final iv in cluster) {
      int placed = colEnds.indexWhere((int e) => e <= iv.start);
      if (placed == -1) {
        placed = colEnds.length;
        colEnds.add(iv.end);
      } else {
        colEnds[placed] = iv.end;
      }
      res[iv.id] = (col: placed, cols: 0);
    }
    final int cols = colEnds.length;
    for (final iv in cluster) {
      final prev = res[iv.id];
      if (prev != null) res[iv.id] = (col: prev.col, cols: cols);
    }
    cluster = <({String id, int start, int end})>[];
    clusterEnd = -1;
  }

  for (final iv in ivs) {
    if (cluster.isNotEmpty && iv.start >= clusterEnd) flush();
    cluster.add(iv);
    clusterEnd = clusterEnd > iv.end ? clusterEnd : iv.end;
  }
  flush();
  return res;
}
