import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

const List<String> _monthNames = <String>[
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
// Год-заглушка 2000 (високосный) → февраль до 29.
const List<int> _maxDays = <int>[31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

int _clampDay(int day, int month) => day.clamp(1, _maxDays[(month - 1).clamp(0, 11)]);

/// (day, month) → ISO YYYY-MM-DD с годом-заглушкой 2000 (день клампится по месяцу).
/// Год не хранит смысла — дата рождения без года, нужен только день+месяц.
String dayMonthToIso(int day, int month) {
  final int d = _clampDay(day, month);
  return '2000-${month.toString().padLeft(2, '0')}-${d.toString().padLeft(2, '0')}';
}

/// ISO YYYY-MM-DD → (day, month); год игнорируем. null если не распарсить.
({int day, int month})? dayMonthFromIso(String? iso) {
  if (iso == null) return null;
  final RegExpMatch? m = RegExp(r'^\d{4}-(\d{2})-(\d{2})$').firstMatch(iso);
  if (m == null) return null;
  final int mo = int.parse(m.group(1)!);
  final int d = int.parse(m.group(2)!);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return (day: d, month: mo);
}

/// ISO → отображение «ДД.ММ» (без года), иначе ''.
String formatDayMonth(String? iso) {
  final ({int day, int month})? dm = dayMonthFromIso(iso);
  if (dm == null) return '';
  return '${dm.day.toString().padLeft(2, '0')}.${dm.month.toString().padLeft(2, '0')}';
}

/// Выбор дня и месяца рождения (без года) — колёса Cupertino. Возвращает
/// (day, month) или null (отмена). Кламп дня по месяцу — при сохранении через
/// [dayMonthToIso].
Future<({int day, int month})?> pickDayMonth(BuildContext context, {int? day, int? month}) {
  int selMonth = (month ?? 1).clamp(1, 12);
  int selDay = (day ?? 1).clamp(1, 31);
  return showModalBottomSheet<({int day, int month})>(
    context: context,
    backgroundColor: context.colors.bg,
    shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (BuildContext ctx) {
      final AppColors c = ctx.colors;
      return SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
              child: Row(
                children: <Widget>[
                  TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Отмена')),
                  const Spacer(),
                  Text('День рождения',
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.ink)),
                  const Spacer(),
                  TextButton(
                    onPressed: () => Navigator.pop(ctx, (day: selDay, month: selMonth)),
                    child: const Text('Готово'),
                  ),
                ],
              ),
            ),
            SizedBox(
              height: 216,
              child: Row(
                children: <Widget>[
                  Expanded(
                    flex: 2,
                    child: CupertinoPicker(
                      scrollController: FixedExtentScrollController(initialItem: selDay - 1),
                      itemExtent: 36,
                      onSelectedItemChanged: (int i) => selDay = i + 1,
                      children: <Widget>[
                        for (int d = 1; d <= 31; d++)
                          Center(child: Text('$d', style: TextStyle(fontSize: 20, color: c.ink))),
                      ],
                    ),
                  ),
                  Expanded(
                    flex: 3,
                    child: CupertinoPicker(
                      scrollController: FixedExtentScrollController(initialItem: selMonth - 1),
                      itemExtent: 36,
                      onSelectedItemChanged: (int i) => selMonth = i + 1,
                      children: <Widget>[
                        for (final String m in _monthNames)
                          Center(child: Text(m, style: TextStyle(fontSize: 20, color: c.ink))),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    },
  );
}
