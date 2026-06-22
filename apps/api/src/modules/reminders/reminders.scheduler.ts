import type { Db } from '../../db/client.js';
import type { Storage } from '../../files/storage.js';
import type { PushService } from '../push/push.service.js';
import { makeRemindersRepo, type RemindersRepo } from './reminders.repo.js';
import { makeFilesRepo } from '../files/files.repo.js';
import { makeAuthRepo } from '../auth/auth.repo.js';
import { makeAuthService } from '../auth/auth.service.js';
import { makeClientAuthRepo } from '../client-auth/client-auth.repo.js';
import { makeClientAuthService } from '../client-auth/client-auth.service.js';

const PACKAGE_LOW_THRESHOLD = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

const RU_MONTHS_SHORT = [
  'янв',
  'фев',
  'мар',
  'апр',
  'мая',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}
function formatWhen(date: string, time: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${String(d ?? '')} ${RU_MONTHS_SHORT[(m ?? 1) - 1] ?? ''}, ${time}`;
}
// Дата+время занятия → мс. Время наивное (без TZ) — для грубой 24ч-границы достаточно.
function whenMs(date: string, time: string): number {
  return Date.parse(`${date}T${time.length === 5 ? `${time}:00` : time}`);
}

type Logger = (msg: string, err?: unknown) => void;

// Один проход напоминаний. Дедуп через push_reminders, чтобы не слать повторно.
async function tick(repo: RemindersRepo, push: PushService, now: Date): Promise<void> {
  if (!push.enabled) return;
  const today = isoDate(now);
  const tomorrow = isoDate(addDays(now, 2)); // окно дат с запасом, точную 24ч считаем ниже
  const in7 = isoDate(addDays(now, 7));
  const mmdd = today.slice(5);

  // 1) Скоро занятие (≤24ч) → клиенту.
  const sess = await repo.upcomingSessions(today, tomorrow);
  for (const s of sess) {
    if (s.clientConfirmation === 'declined') continue;
    const diff = whenMs(s.date, s.startTime) - now.getTime();
    if (Number.isNaN(diff) || diff < 0 || diff > DAY_MS) continue;
    if (await repo.markIfNew(`soon:${s.id}`, now)) {
      await push.notifyClientFrom(s.clientId, s.trainerId, (trainerName) => ({
        title: 'Скоро занятие',
        body: `Занятие с ${trainerName} ${formatWhen(s.date, s.startTime)}`,
        url: '/calendar',
      }));
    }
  }

  // 2) Баланс пакетов → «заканчивается» клиенту и «нет занятий на неделю» тренеру.
  const balances = await repo.clientBalances();
  const upcoming = new Set(
    (await repo.upcomingClientKeys(today, in7)).map((r) => `${r.trainerId}:${r.clientId}`),
  );
  const weekBucket = Math.floor(now.getTime() / (7 * DAY_MS));
  for (const b of balances) {
    if (b.remaining <= PACKAGE_LOW_THRESHOLD) {
      if (await repo.markIfNew(`pkg:${b.clientId}:${b.remaining}`, now)) {
        await push.notifyByClientId(b.clientId, {
          title: 'Пакет тренировок',
          body:
            b.remaining <= 0
              ? 'Пакет закончился — обратитесь к тренеру'
              : `Пакет заканчивается: осталось ${b.remaining}`,
          url: '/chat',
        });
      }
    }
    if (b.remaining > 0 && !upcoming.has(`${b.trainerId}:${b.clientId}`)) {
      if (await repo.markIfNew(`noup:${b.trainerId}:${b.clientId}:${weekBucket}`, now)) {
        await push.notifyTrainer(b.trainerId, {
          title: 'Нет занятий на неделю',
          body: `${b.firstName} ${b.lastName}: оплачено, но нет записи на 7 дней`,
          url: `/clients/${b.clientId}`,
        });
      }
    }
  }

  // 3) День рождения клиента сегодня → тренеру.
  const year = today.slice(0, 4);
  for (const c of await repo.birthdaysToday(mmdd)) {
    if (await repo.markIfNew(`bday:${c.clientId}:${year}`, now)) {
      await push.notifyTrainer(c.trainerId, {
        title: 'День рождения',
        body: `Сегодня день рождения у ${c.firstName} ${c.lastName} 🎂`,
        url: `/clients/${c.clientId}`,
      });
    }
  }
}

export type SchedulerDeps = {
  db: Db;
  push: PushService;
  storage: Storage;
  newId: () => string;
  now: () => Date;
  log: Logger;
  intervalMs?: number;
};

// Запускает периодический планировщик напоминаний. Возвращает stop().
// Дедуп в БД → безопасно при рестартах/нескольких инстансах.
export function startRemindersScheduler(deps: SchedulerDeps): () => void {
  const repo = makeRemindersRepo(deps.db);
  // Сервисы авторизации — для досноса аккаунтов с истёкшим окном отмены удаления.
  const filesRepo = makeFilesRepo(deps.db);
  const authSvc = makeAuthService(makeAuthRepo(deps.db), filesRepo, deps.storage, {
    newId: deps.newId,
    now: deps.now,
  });
  const clientAuthSvc = makeClientAuthService(
    makeClientAuthRepo(deps.db),
    filesRepo,
    deps.storage,
    {
      newId: deps.newId,
      now: deps.now,
    },
  );
  const interval = deps.intervalMs ?? 30 * 60 * 1000; // каждые 30 минут
  const run = () => {
    void tick(repo, deps.push, deps.now()).catch((err: unknown) => {
      deps.log('[reminders] tick failed', err);
    });
    // Снос аккаунтов, у которых истекло окно отмены удаления.
    void authSvc.purgeExpiredDeletions().catch((err: unknown) => {
      deps.log('[deletion] trainer purge failed', err);
    });
    void clientAuthSvc.purgeExpiredDeletions().catch((err: unknown) => {
      deps.log('[deletion] client purge failed', err);
    });
  };
  // Первый прогон через 30с (дать сервису прогрузиться), затем по интервалу.
  const first = setTimeout(run, 30_000);
  const timer = setInterval(run, interval);
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
