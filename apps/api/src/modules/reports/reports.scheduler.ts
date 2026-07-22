import type { ReportsRepo } from './reports.repo.js';
import { formatReport } from './reports.format.js';

export type ReportsSchedulerDeps = {
  repo: ReportsRepo;
  // Отправка в группу отчётов. Берём узкий контракт (только sendToGeneral),
  // чтобы не тащить сюда весь TelegramClient поддержки.
  send: (text: string) => Promise<void>;
  now: () => Date;
  log: (msg: string, err?: unknown) => void;
  // Час отправки (локальное время сервера), по умолчанию 9 утра.
  hour?: number;
  // Как часто просыпаться и проверять, не пора ли слать. По умолчанию 10 минут.
  intervalMs?: number;
};

const RU_MONTHS = [
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

export function dayLabel(d: Date): string {
  return `${d.getDate()} ${RU_MONTHS[d.getMonth()]}`;
}

/// Начало суток (локально) для даты.
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/// Ключ «уже отправлено» — чтобы при перезапуске сервиса или частых тиках отчёт
/// за один и тот же день не ушёл дважды.
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/// Планировщик отчётов: ежедневная сводка за вчера и, по понедельникам,
/// недельный итог за прошедшие 7 дней. Просыпается раз в [intervalMs] и шлёт,
/// когда наступил нужный час и за этот день ещё не слали. Возвращает stop().
///
/// Состояние «что уже отправлено» — в памяти: после рестарта сервиса в тот же
/// день отчёт может уйти повторно. Осознанный размен: отдельная таблица ради
/// дублей раз в год избыточна, а рестарты у нас редкие (деплой).
export function startReportsScheduler(deps: ReportsSchedulerDeps): () => void {
  const hour = deps.hour ?? 9;
  const interval = deps.intervalMs ?? 10 * 60 * 1000;
  let sentDaily: string | null = null;
  let sentWeekly: string | null = null;
  let running = false;

  async function tick(): Promise<void> {
    if (running) return; // предыдущий прогон ещё идёт — не наслаиваем
    running = true;
    try {
      const now = deps.now();
      if (now.getHours() < hour) return;

      const today = startOfDay(now);
      const key = dayKey(today);

      if (sentDaily !== key) {
        const from = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        const data = await deps.repo.collect(from, today);
        const prevFrom = new Date(from.getTime() - 24 * 60 * 60 * 1000);
        const prev = await deps.repo.collect(prevFrom, from);
        await deps.send(formatReport(`Отчёт за ${dayLabel(from)}`, data, prev));
        sentDaily = key;
      }

      // Недельный итог — по понедельникам (getDay() === 1), за 7 прошедших суток.
      if (now.getDay() === 1 && sentWeekly !== key) {
        const from = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        const data = await deps.repo.collect(from, today);
        const prevFrom = new Date(from.getTime() - 7 * 24 * 60 * 60 * 1000);
        const prev = await deps.repo.collect(prevFrom, from);
        await deps.send(
          formatReport(`Недельный итог: ${dayLabel(from)} — ${dayLabel(today)}`, data, prev),
        );
        sentWeekly = key;
      }
    } finally {
      running = false;
    }
  }

  function run(): void {
    void tick().catch((err: unknown) => {
      // Отчёт — не критичный путь: логируем и живём дальше, процесс не роняем.
      deps.log('[reports] tick failed', err);
    });
  }

  const first = setTimeout(run, 60_000);
  const timer = setInterval(run, interval);
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
