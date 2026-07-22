import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { makeReportsRepo } from './reports.repo.js';

const url = process.env.DATABASE_URL;

// Проверяем, что 16 агрегатов реально выполняются в Postgres: имена колонок,
// синтаксис, группировки. Юнит-тесты покрывают формат, но не SQL.
describe.skipIf(!url)('reports.repo (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  const repo = makeReportsRepo(db);

  const from = new Date(2026, 0, 10);
  const to = new Date(2026, 0, 11);
  const inside = new Date(2026, 0, 10, 12); // внутри периода
  const outside = new Date(2026, 0, 5, 12); // до периода — не должен считаться

  beforeAll(async () => {
    for (const t of [
      'analytics_screen_events',
      'error_logs',
      'payment_packages',
      'measurements',
      'sessions',
      'client_workouts',
      'trainer_clients',
      'clients',
      'client_accounts',
      'trainers',
    ]) {
      await db.execute(sql.raw(`DELETE FROM ${t}`));
    }
  });

  afterAll(async () => {
    await pg.end();
  });

  it('на пустой базе отдаёт нули и не падает (все запросы валидны)', async () => {
    const d = await repo.collect(from, to);
    expect(d.growth.newTrainers).toBe(0);
    expect(d.totals.find((t) => t.label === 'Тренеры')?.now).toBe(0);
    expect(d.business.workoutsCompleted).toBe(0);
    expect(d.business.packagesSum).toBe(0);
    expect(d.health.errors).toBe(0);
    expect(d.health.topErrors).toEqual([]);
    expect(d.screens).toEqual([]);
  });

  it('считает только попавшее в период и группирует ошибки/экраны', async () => {
    // Тренеры: один в периоде, один раньше — «новых» должен быть 1, всего 2.
    await db.execute(sql`
      INSERT INTO trainers (id, email, password_hash, first_name, last_name, created_at)
      VALUES ('t-in', 'in@x.co', 'h', 'И', 'И', ${inside.toISOString()}::timestamptz),
             ('t-out', 'out@x.co', 'h', 'О', 'О', ${outside.toISOString()}::timestamptz)
    `);

    // Ошибки: две одинаковые + одна другая → топ должен вернуть их по убыванию.
    await db.execute(sql`
      INSERT INTO error_logs (id, ts, source, level, message)
      VALUES ('e1', ${inside.toISOString()}::timestamptz, 'api', 'error', 'boom'),
             ('e2', ${inside.toISOString()}::timestamptz, 'api', 'error', 'boom'),
             ('e3', ${inside.toISOString()}::timestamptz, 'api', 'error', 'other'),
             ('e4', ${outside.toISOString()}::timestamptz, 'api', 'error', 'старая')
    `);

    // Экраны: два входа на «Клиенты» (90с) и один на «Календарь» (30с).
    await db.execute(sql`
      INSERT INTO analytics_screen_events
        (id, subject_type, subject_id, session_id, screen, duration_sec, entered_at, app_version, platform)
      VALUES ('s1', 'trainer', 'u1', 'sess1', 'Клиенты', 60, ${inside.toISOString()}::timestamptz, '1.5.0', 'android'),
             ('s2', 'trainer', 'u2', 'sess2', 'Клиенты', 30, ${inside.toISOString()}::timestamptz, '1.5.0', 'android'),
             ('s3', 'client',  'c1', 'sess3', 'Календарь', 30, ${inside.toISOString()}::timestamptz, '1.5.0', 'ios')
    `);

    const d = await repo.collect(from, to);

    expect(d.growth.newTrainers).toBe(1);
    expect(d.totals.find((t) => t.label === 'Тренеры')).toEqual({
      label: 'Тренеры',
      now: 2,
      was: 1,
    });
    // Активные считаются по subject_type: два тренера и один клиент.
    expect(d.growth.activeTrainers).toBe(2);
    expect(d.growth.activeClients).toBe(1);

    expect(d.health.errors).toBe(3); // старая ошибка вне периода не в счёт
    expect(d.health.topErrors[0]).toEqual({ message: 'boom', count: 2 });

    expect(d.screens[0]).toEqual({ screen: 'Клиенты', minutes: 1, opens: 2 });
    expect(d.health.versions[0]?.version).toBe('1.5.0');
  });
});
