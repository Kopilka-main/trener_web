const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Заголовок группы: «Сегодня» / «Вчера» / «28 мая» (по локальному времени). */
export function formatDateGroup(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const today = ymd(now);
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (ymd(d) === today) return 'Сегодня';
  if (ymd(d) === ymd(yest)) return 'Вчера';
  return `${d.getDate()} ${MONTHS[d.getMonth()] ?? ''}`;
}

/** Время ЧЧ:ММ по локали ru. */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
