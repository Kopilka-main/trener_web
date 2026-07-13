import { describe, it, expect, vi } from 'vitest';
import type { MeasurementsRepo, MeasurementRow } from './measurements.repo.js';
import { makeMeasurementsService } from './measurements.service.js';

function row(over: Partial<MeasurementRow> = {}): MeasurementRow {
  return {
    id: 'm1',
    trainerId: 'A',
    clientId: 'c1',
    date: '2026-06-01',
    weightKg: 80,
    skeletalMuscleKg: null,
    bodyFatPct: null,
    bicepsCm: null,
    chestCm: null,
    underbustCm: null,
    waistCm: null,
    bellyCm: null,
    glutesCm: null,
    hipsCm: null,
    thighCm: null,
    calfCm: null,
    note: null,
    createdByClient: false,
    createdAt: new Date(0),
    ...over,
  };
}

function fakeRepo(over: Partial<MeasurementsRepo> = {}): MeasurementsRepo {
  return {
    create: vi.fn(() => Promise.resolve(row())),
    listForClient: vi.fn(() => Promise.resolve([])),
    getForTrainer: vi.fn(() => Promise.resolve(null)),
    update: vi.fn(() => Promise.resolve(null)),
    remove: vi.fn(() => Promise.resolve(false)),
    ...over,
  };
}

const deps = { newId: () => 'newid' };

describe('measurements.service', () => {
  it('create генерирует id, прокидывает scope тренер+клиент и резолвит ответ', async () => {
    const create = vi.fn(() => Promise.resolve(row()));
    const svc = makeMeasurementsService(fakeRepo({ create }), deps);
    const res = await svc.create('A', 'c1', { date: '2026-06-01', weightKg: 80 });
    expect(res.clientId).toBe('c1');
    expect(res.weightKg).toBe(80);
    expect(res.createdAt).toBe(new Date(0).toISOString());
    expect(create).toHaveBeenCalledWith(
      'A',
      'c1',
      expect.objectContaining({ id: 'newid', date: '2026-06-01', weightKg: 80 }),
    );
  });

  it('create не прокидывает опущенные метрики', async () => {
    const create = vi.fn(() => Promise.resolve(row()));
    const svc = makeMeasurementsService(fakeRepo({ create }), deps);
    await svc.create('A', 'c1', { date: '2026-06-01' });
    expect(create).toHaveBeenCalledWith('A', 'c1', {
      id: 'newid',
      date: '2026-06-01',
      createdByClient: false,
    });
  });

  it('create проставляет createdByClient=false по умолчанию (тренерский контур)', async () => {
    const create = vi.fn(() => Promise.resolve(row()));
    const svc = makeMeasurementsService(fakeRepo({ create }), deps);
    const res = await svc.create('A', 'c1', { date: '2026-06-01' });
    expect(res.createdByClient).toBe(false);
    expect(create).toHaveBeenCalledWith(
      'A',
      'c1',
      expect.objectContaining({ createdByClient: false }),
    );
  });

  it('create проставляет createdByClient=true в клиентском контуре (deps)', async () => {
    const create = vi.fn(() => Promise.resolve(row({ createdByClient: true })));
    const svc = makeMeasurementsService(fakeRepo({ create }), { ...deps, createdByClient: true });
    const res = await svc.create('A', 'c1', { date: '2026-06-01' });
    expect(res.createdByClient).toBe(true);
    expect(create).toHaveBeenCalledWith(
      'A',
      'c1',
      expect.objectContaining({ createdByClient: true }),
    );
  });

  it('list резолвит ответы', async () => {
    const svc = makeMeasurementsService(
      fakeRepo({ listForClient: vi.fn(() => Promise.resolve([row(), row({ id: 'm2' })])) }),
      deps,
    );
    const res = await svc.list('A', 'c1');
    expect(res.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('get бросает 404, если repo.getForTrainer → null', async () => {
    const svc = makeMeasurementsService(fakeRepo(), deps);
    await expect(svc.get('A', 'c1', 'missing')).rejects.toMatchObject({ status: 404 });
  });

  it('update прокидывает patch (null очищает поле) и резолвит ответ', async () => {
    const update = vi.fn(() => Promise.resolve(row({ weightKg: 78, note: null })));
    const svc = makeMeasurementsService(fakeRepo({ update }), deps);
    const res = await svc.update('A', 'c1', 'm1', { weightKg: 78, note: null });
    expect(res.weightKg).toBe(78);
    expect(update).toHaveBeenCalledWith(
      'A',
      'c1',
      'm1',
      expect.objectContaining({ weightKg: 78, note: null }),
    );
  });

  it('update бросает 404, если repo.update → null', async () => {
    const svc = makeMeasurementsService(fakeRepo(), deps);
    await expect(svc.update('A', 'c1', 'missing', { weightKg: 1 })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('remove бросает 404, если repo.remove=false', async () => {
    const svc = makeMeasurementsService(fakeRepo(), deps);
    await expect(svc.remove('A', 'c1', 'missing')).rejects.toMatchObject({ status: 404 });
  });

  it('remove не бросает, если repo.remove=true', async () => {
    const svc = makeMeasurementsService(
      fakeRepo({ remove: vi.fn(() => Promise.resolve(true)) }),
      deps,
    );
    await expect(svc.remove('A', 'c1', 'm1')).resolves.toBeUndefined();
  });
});
