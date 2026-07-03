// Форматирование и набор российских телефонов.
//
// Читаемый вид «8 926 789 85 65» — группы 1/3/3/2/2. Единая логика используется
// и при отображении (formatPhone), и при вводе (RuPhoneInputFormatter), чтобы
// номер выглядел одинаково везде.

import 'package:flutter/services.dart';

/// Только цифры из строки.
String _digits(String s) => s.replaceAll(RegExp(r'[^0-9]'), '');

/// Собирает до 11 цифр в вид «8 XXX XXX XX XX», форматируя прогрессивно
/// (частичный ввод: 8, 8 9, 8 92, 8 926, 8 926 7 …). Первая цифра всегда 8.
/// Ожидает уже нормализованные цифры (первая приведена к 8, длина ≤ 11).
String _groupRu(String d) {
  if (d.isEmpty) return '';
  final StringBuffer sb = StringBuffer();
  // Границы групп по числу уже выведенных цифр: 1 | 3 | 3 | 2 | 2.
  const List<int> stops = <int>[1, 4, 7, 9, 11];
  for (int i = 0; i < d.length; i++) {
    if (stops.contains(i)) sb.write(' ');
    sb.write(d[i]);
  }
  return sb.toString();
}

/// Читаемый формат телефона для отображения.
///
/// - 11 цифр и первая 7 или 8 → «8 XXX XXX XX XX» (первую приводим к 8);
/// - 10 цифр → «8 XXX XXX XX XX» (дописываем ведущую 8);
/// - иначе (нестандартная длина, межгород, короткий, зарубежный) → исходная
///   строка как есть (trim), ведущий «+» при этом сохраняется естественным
///   образом, потому что мы её не трогаем.
String formatPhone(String raw) {
  final String trimmed = raw.trim();
  final String d = _digits(trimmed);
  if (d.length == 11 && (d[0] == '7' || d[0] == '8')) {
    return _groupRu('8${d.substring(1)}');
  }
  if (d.length == 10) {
    return _groupRu('8$d');
  }
  return trimmed;
}

/// `Uri` со схемой `tel:` для набора номера. Сохраняет ведущий «+», убирает
/// пробелы и прочие разделители внутри номера.
Uri phoneTelUri(String raw) {
  final String trimmed = raw.trim();
  final bool plus = trimmed.startsWith('+');
  final String path = '${plus ? '+' : ''}${_digits(trimmed)}';
  return Uri(scheme: 'tel', path: path);
}

/// Маска ввода российского телефона: форматирует по мере набора в вид
/// «8 XXX XXX XX XX». Курсор ставится в конец (для ввода телефона это надёжно и
/// приемлемо). Длина ограничена 11 цифрами; первая цифра приводится к 8.
class RuPhoneInputFormatter extends TextInputFormatter {
  const RuPhoneInputFormatter();

  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    String d = _digits(newValue.text);
    if (d.isEmpty) {
      return const TextEditingValue(text: '', selection: TextSelection.collapsed(offset: 0));
    }
    // Первую цифру нормализуем к 8 (7 → 8), остальное — как есть.
    if (d[0] == '7') d = '8${d.substring(1)}';
    if (d.length > 11) d = d.substring(0, 11);
    final String formatted = _groupRu(d);
    return TextEditingValue(
      text: formatted,
      selection: TextSelection.collapsed(offset: formatted.length),
    );
  }
}
