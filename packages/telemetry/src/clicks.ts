// Безопасная метка кликнутого элемента: только обезличенное, без значений полей.
export function clickLabel(target: HTMLElement | null): string | null {
  const el = target?.closest<HTMLElement>(
    '[data-track],button,a,[role="button"],[role="tab"],input,select,textarea',
  );
  if (!el) return null;

  const track = el.getAttribute('data-track');
  if (track) return track.slice(0, 64);

  const aria = el.getAttribute('aria-label');
  if (aria) return aria.slice(0, 64);

  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return tag;

  const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
  if (text) return text.slice(0, 64);

  return tag;
}
