import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { makeOAuthRepo } from './oauth.repo.js';

const url = process.env.DATABASE_URL;

// Изоляция OAuth на уровне БД: state одноразовый (popState удаляет строку); oauth_account
// одного контура (trainer) не пересекается с другим (client) — findAccount отдаёт ровно
// ту привязку, что создана. Self-skip без DATABASE_URL (гоняется против trener_test).
describe.skipIf(!url)('oauth isolation (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  let seq = 0;
  const repo = makeOAuthRepo(
    db,
    () => `oid-${++seq}`,
    () => new Date(),
  );

  beforeEach(async () => {
    seq = 0;
    await db.execute(sql`DELETE FROM oauth_accounts`);
    await db.execute(sql`DELETE FROM oauth_states`);
    await db.execute(sql`DELETE FROM client_sessions_auth`);
    await db.execute(sql`DELETE FROM client_accounts`);
    await db.execute(sql`DELETE FROM sessions_auth`);
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM trainers`);
  });
  afterAll(async () => {
    await pg.end();
  });

  it('state одноразовый: первый popState отдаёт строку, второй — null', async () => {
    await repo.saveState({ state: 'st-1', provider: 'vk', app: 'trainer', verifier: 'v1' });
    const first = await repo.popState('st-1');
    expect(first).not.toBeNull();
    expect(first?.provider).toBe('vk');
    expect(first?.app).toBe('trainer');
    expect(first?.verifier).toBe('v1');

    const second = await repo.popState('st-1');
    expect(second).toBeNull();
  });

  it('oauth_account контура trainer не пересекается с client (та же пара provider/id в разных контурах)', async () => {
    // Заводим по одному аккаунту каждого контура.
    const trainerId = await repo.createTrainerAccount({
      email: 't@oauth.fitbond',
      firstName: 'Т',
      lastName: 'Р',
    });
    const clientAccountId = await repo.createClientAccount({
      email: 'c@oauth.fitbond',
      firstName: 'К',
      lastName: 'Л',
    });

    // vk:100 привязан к тренеру, yandex:100 — к клиенту (одинаковый providerUserId, разные провайдеры).
    await repo.linkAccount({ provider: 'vk', providerUserId: '100', trainerId });
    await repo.linkAccount({ provider: 'yandex', providerUserId: '100', clientAccountId });

    const vk = await repo.findAccount('vk', '100');
    expect(vk?.trainerId).toBe(trainerId);
    expect(vk?.clientAccountId).toBeNull();

    const ya = await repo.findAccount('yandex', '100');
    expect(ya?.clientAccountId).toBe(clientAccountId);
    expect(ya?.trainerId).toBeNull();

    // Ровно один владелец у каждой привязки (контуры не смешиваются).
    expect(vk?.clientAccountId).not.toBe(ya?.clientAccountId);
  });

  it('уникальность (provider, providerUserId): повторный link той же пары падает', async () => {
    const trainerId = await repo.createTrainerAccount({
      email: 't2@oauth.fitbond',
      firstName: 'Т',
      lastName: 'Р',
    });
    await repo.linkAccount({ provider: 'vk', providerUserId: '200', trainerId });
    await expect(
      repo.linkAccount({ provider: 'vk', providerUserId: '200', trainerId }),
    ).rejects.toThrow();
  });
});
