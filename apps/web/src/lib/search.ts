// Лёгкий клиентский поиск по тексту: нормализация (регистр, ё→е, пунктуация),
// поиск по словам в любом порядке (AND с префиксом), лёгкая опечаточная
// толерантность и скоринг для ранжирования по релевантности. Без зависимостей.

/** Приводит строку к виду для сравнения: lowercase, ё→е, пунктуация/дефисы → пробел. */
export function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^0-9a-zа-я]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokens(normalized: string): string[] {
  return normalized === '' ? [] : normalized.split(' ');
}

/** true, если расстояние Левенштейна между a и b не больше 1 (одна опечатка). */
function withinEdit1(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (la > lb) i += 1;
    else if (lb > la) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  if (i < la || j < lb) edits += 1;
  return edits <= 1;
}

/** Вклад одного слова запроса в общий скор (или null, если слово не найдено). */
function tokenScore(qt: string, textTokens: string[], fullText: string): number | null {
  let best: number | null = null;
  for (const tt of textTokens) {
    if (tt === qt) best = Math.max(best ?? 0, 100);
    else if (tt.startsWith(qt)) best = Math.max(best ?? 0, 60);
  }
  if (best !== null) return best;
  // слово встречается где-то в середине слова текста
  if (fullText.includes(qt)) return 30;
  // лёгкая опечаточная толерантность для слов от 3 символов
  if (qt.length >= 3 && textTokens.some((tt) => withinEdit1(qt, tt))) return 20;
  return null;
}

/**
 * Скор соответствия запроса тексту: число (больше — релевантнее) либо null, если
 * не подходит. Пустой запрос → 0 (подходит всё). Все слова запроса должны
 * найтись (в любом порядке); целая фраза подряд даёт крупный бонус.
 */
export function searchScore(query: string, text: string): number | null {
  const q = normalizeSearch(query);
  if (q === '') return 0;
  const t = normalizeSearch(text);
  if (t === '') return null;

  const tToks = tokens(t);
  let score = 0;
  for (const qt of tokens(q)) {
    const s = tokenScore(qt, tToks, t);
    if (s === null) return null; // хотя бы одно слово не найдено → не подходит
    score += s;
  }
  // Бонус за целую фразу подстрокой (слова идут подряд); раньше в тексте = выше.
  const idx = t.indexOf(q);
  if (idx !== -1) score += 1000 - Math.min(idx, 999);
  return score;
}

/** Фильтрует и сортирует элементы по релевантности к запросу (стабильно). */
export function rankBySearch<T>(items: T[], query: string, getText: (item: T) => string): T[] {
  if (normalizeSearch(query) === '') return items;
  return items
    .map((item, i) => ({ item, i, score: searchScore(query, getText(item)) }))
    .filter((x): x is { item: T; i: number; score: number } => x.score !== null)
    .sort(
      (a, b) => b.score - a.score || getText(a.item).length - getText(b.item).length || a.i - b.i,
    )
    .map((x) => x.item);
}
