import { describe, it, expect } from 'vitest';
import { normalizeSearch, searchScore, rankBySearch } from './search';

describe('normalizeSearch', () => {
  it('lowercase, ё→е, схлопывает пунктуацию/пробелы', () => {
    expect(normalizeSearch('Жим  ЛЁЖА-2')).toBe('жим лежа 2');
    expect(normalizeSearch('  Пресс/Кор ')).toBe('пресс кор');
  });
});

describe('searchScore', () => {
  it('находит по словам не подряд: «жим лежа» → «Жим штанги лёжа»', () => {
    expect(searchScore('жим лежа', 'Жим штанги лёжа')).not.toBeNull();
  });

  it('ё/е не мешает', () => {
    expect(searchScore('лежа', 'Жим штанги лёжа')).not.toBeNull();
    expect(searchScore('лёжа', 'Жим штанги лежа')).not.toBeNull();
  });

  it('пустой запрос подходит всему (скор 0)', () => {
    expect(searchScore('', 'Что угодно')).toBe(0);
  });

  it('если хотя бы одно слово не найдено → null', () => {
    expect(searchScore('жим присед', 'Жим штанги лёжа')).toBeNull();
  });

  it('целая фраза-подстрока ранжируется выше, чем разрозненные слова', () => {
    const whole = searchScore('жим штанги', 'Жим штанги лёжа');
    const split = searchScore('жим лежа', 'Жим штанги лёжа');
    expect(whole).not.toBeNull();
    expect(split).not.toBeNull();
    expect(whole!).toBeGreaterThan(split!);
  });

  it('терпит одну опечатку в слове от 4 символов', () => {
    expect(searchScore('жым лежа', 'Жим штанги лёжа')).not.toBeNull(); // жым→жим
    expect(searchScore('присидания', 'Приседания со штангой')).not.toBeNull();
  });

  it('точное слово ранжируется выше префикса/подстроки', () => {
    const exact = searchScore('жим', 'Жим гантелей') ?? -1;
    const prefix = searchScore('жим', 'Жимовой швунг') ?? -1;
    expect(exact).toBeGreaterThan(prefix);
  });
});

describe('rankBySearch', () => {
  const list = ['Жим штанги лёжа', 'Жим гантелей сидя', 'Приседания со штангой'];

  it('фильтрует и сортирует по релевантности', () => {
    const r = rankBySearch(list, 'жим лежа', (x) => x);
    expect(r).toEqual(['Жим штанги лёжа']);
  });

  it('пустой запрос возвращает исходный список', () => {
    expect(rankBySearch(list, '', (x) => x)).toEqual(list);
  });

  it('по «жим» находит оба жима, присед — нет', () => {
    const r = rankBySearch(list, 'жим', (x) => x);
    expect(r).toHaveLength(2);
    expect(r).toContain('Жим штанги лёжа');
    expect(r).toContain('Жим гантелей сидя');
  });
});
