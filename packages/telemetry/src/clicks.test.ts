import { describe, it, expect } from 'vitest';
import { clickLabel } from './clicks.js';

function el(html: string): HTMLElement {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.firstElementChild as HTMLElement;
}

describe('clickLabel', () => {
  it('берёт data-track в приоритете', () => {
    const e = el('<button data-track="save" aria-label="Сохранить">Сохранить всё</button>');
    expect(clickLabel(e)).toBe('save');
  });
  it('затем aria-label', () => {
    expect(clickLabel(el('<button aria-label="Назад">x</button>'))).toBe('Назад');
  });
  it('затем короткий текст', () => {
    expect(clickLabel(el('<a>Открыть</a>'))).toBe('Открыть');
  });
  it('НЕ берёт значение поля ввода', () => {
    expect(clickLabel(el('<input value="секрет 123" />'))).toBe('input');
  });
  it('обрезает длинный текст до 64', () => {
    const long = 'я'.repeat(200);
    expect((clickLabel(el(`<button>${long}</button>`)) ?? '').length).toBeLessThanOrEqual(64);
  });
});
