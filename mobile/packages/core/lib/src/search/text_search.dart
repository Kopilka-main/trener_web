// Лёгкий клиентский поиск по тексту (порт apps/web/src/lib/search.ts):
// нормализация (регистр, ё→е, пунктуация), поиск по словам в любом порядке
// (AND с префиксом), лёгкая опечаточная толерантность и скоринг для ранжирования.

/// Приводит строку к виду для сравнения: lowercase, ё→е, пунктуация/дефисы → пробел.
String normalizeSearch(String s) {
  return s
      .toLowerCase()
      .replaceAll('ё', 'е')
      .replaceAll(RegExp(r'[^0-9a-zа-я]+'), ' ')
      .trim()
      .replaceAll(RegExp(r'\s+'), ' ');
}

List<String> _tokens(String normalized) =>
    normalized.isEmpty ? <String>[] : normalized.split(' ');

int _max(int? a, int b) => (a == null || b > a) ? b : a;

/// true, если расстояние Левенштейна между a и b не больше 1 (одна опечатка).
bool _withinEdit1(String a, String b) {
  if (a == b) return true;
  final int la = a.length;
  final int lb = b.length;
  if ((la - lb).abs() > 1) return false;
  int i = 0;
  int j = 0;
  int edits = 0;
  while (i < la && j < lb) {
    if (a[i] == b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (la > lb) {
      i += 1;
    } else if (lb > la) {
      j += 1;
    } else {
      i += 1;
      j += 1;
    }
  }
  if (i < la || j < lb) edits += 1;
  return edits <= 1;
}

/// Вклад одного слова запроса в общий скор (или null, если слово не найдено).
int? _tokenScore(String qt, List<String> textTokens, String fullText) {
  int? best;
  for (final String tt in textTokens) {
    if (tt == qt) {
      best = _max(best, 100);
    } else if (tt.startsWith(qt)) {
      best = _max(best, 60);
    }
  }
  if (best != null) return best;
  if (fullText.contains(qt)) return 30;
  if (qt.length >= 3 && textTokens.any((String tt) => _withinEdit1(qt, tt))) return 20;
  return null;
}

/// Скор соответствия запроса тексту (больше — релевантнее) либо null, если не
/// подходит. Пустой запрос → 0 (подходит всё). Все слова запроса должны найтись
/// (в любом порядке); целая фраза подряд даёт крупный бонус.
int? searchScore(String query, String text) {
  final String q = normalizeSearch(query);
  if (q.isEmpty) return 0;
  final String t = normalizeSearch(text);
  if (t.isEmpty) return null;

  final List<String> tToks = _tokens(t);
  int score = 0;
  for (final String qt in _tokens(q)) {
    final int? s = _tokenScore(qt, tToks, t);
    if (s == null) return null; // хотя бы одно слово не найдено → не подходит
    score += s;
  }
  final int idx = t.indexOf(q);
  if (idx != -1) score += 1000 - (idx < 999 ? idx : 999);
  return score;
}

/// Фильтрует и сортирует элементы по релевантности к запросу (стабильно).
List<T> rankBySearch<T>(List<T> items, String query, String Function(T) getText) {
  if (normalizeSearch(query).isEmpty) return items;
  final List<({T item, int i, int score})> scored = <({T item, int i, int score})>[];
  for (int i = 0; i < items.length; i++) {
    final int? s = searchScore(query, getText(items[i]));
    if (s != null) scored.add((item: items[i], i: i, score: s));
  }
  scored.sort((({T item, int i, int score}) a, ({T item, int i, int score}) b) {
    final int byScore = b.score - a.score;
    if (byScore != 0) return byScore;
    final int byLen = getText(a.item).length - getText(b.item).length;
    if (byLen != 0) return byLen;
    return a.i - b.i;
  });
  return scored.map((({T item, int i, int score}) x) => x.item).toList();
}
