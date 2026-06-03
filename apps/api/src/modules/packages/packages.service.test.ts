import { describe, it, expect, vi } from 'vitest';
import type { PackagesRepo, PackageRow } from './packages.repo.js';
import { makePackagesService } from './packages.service.js';

function row(over: Partial<PackageRow> = {}): PackageRow {
  return {
    id: 'p1',
    trainerId: 'A',
    clientId: 'c1',
    lessonsPaid: 10,
    lessonsUsed: 0,
    pricePerLesson: 1500,
    totalPaid: 15000,
    workoutType: null,
    startsAt: '2026-06-01',
    status: 'active',
    note: null,
    tags: [],
    createdAt: new Date(0),
    ...over,
  };
}

function fakeRepo(over: Partial<PackagesRepo> = {}): PackagesRepo {
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

describe('packages.service', () => {
  it('create генерирует id, прокидывает scope тренер+клиент и резолвит ответ', async () => {
    const create = vi.fn(() => Promise.resolve(row()));
    const svc = makePackagesService(fakeRepo({ create }), deps);
    const res = await svc.create('A', 'c1', {
      lessonsPaid: 10,
      pricePerLesson: 1500,
      totalPaid: 15000,
      startsAt: '2026-06-01',
    });
    expect(res.clientId).toBe('c1');
    expect(res.status).toBe('active');
    expect(res.lessonsUsed).toBe(0);
    expect(res.createdAt).toBe(new Date(0).toISOString());
    expect(create).toHaveBeenCalledWith(
      'A',
      'c1',
      expect.objectContaining({ id: 'newid', lessonsPaid: 10, startsAt: '2026-06-01' }),
    );
  });

  it('create прокидывает заданные workoutType/note', async () => {
    const create = vi.fn(() => Promise.resolve(row({ workoutType: 'Силовая', note: 'нал' })));
    const svc = makePackagesService(fakeRepo({ create }), deps);
    await svc.create('A', 'c1', {
      lessonsPaid: 5,
      pricePerLesson: 1000,
      totalPaid: 5000,
      startsAt: '2026-06-01',
      workoutType: 'Силовая',
      note: 'нал',
    });
    expect(create).toHaveBeenCalledWith(
      'A',
      'c1',
      expect.objectContaining({ workoutType: 'Силовая', note: 'нал' }),
    );
  });

  it('list резолвит ответы', async () => {
    const svc = makePackagesService(
      fakeRepo({ listForClient: vi.fn(() => Promise.resolve([row(), row({ id: 'p2' })])) }),
      deps,
    );
    const res = await svc.list('A', 'c1');
    expect(res.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('get бросает 404, если repo.getForTrainer → null', async () => {
    const svc = makePackagesService(fakeRepo(), deps);
    await expect(svc.get('A', 'c1', 'missing')).rejects.toMatchObject({ status: 404 });
  });

  it('update прокидывает patch и резолвит ответ', async () => {
    const update = vi.fn(() => Promise.resolve(row({ status: 'closed', lessonsPaid: 8 })));
    const svc = makePackagesService(fakeRepo({ update }), deps);
    const res = await svc.update('A', 'c1', 'p1', { lessonsPaid: 8, status: 'closed' });
    expect(res.status).toBe('closed');
    expect(update).toHaveBeenCalledWith(
      'A',
      'c1',
      'p1',
      expect.objectContaining({ lessonsPaid: 8, status: 'closed' }),
    );
  });

  it('update прокидывает lessonsUsed в patch', async () => {
    const update = vi.fn(() => Promise.resolve(row({ lessonsUsed: 3 })));
    const svc = makePackagesService(fakeRepo({ update }), deps);
    const res = await svc.update('A', 'c1', 'p1', { lessonsUsed: 3 });
    expect(res.lessonsUsed).toBe(3);
    expect(update).toHaveBeenCalledWith(
      'A',
      'c1',
      'p1',
      expect.objectContaining({ lessonsUsed: 3 }),
    );
  });

  it('update бросает 404, если repo.update → null', async () => {
    const svc = makePackagesService(fakeRepo(), deps);
    await expect(svc.update('A', 'c1', 'missing', { status: 'closed' })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('remove бросает 404, если repo.remove=false', async () => {
    const svc = makePackagesService(fakeRepo(), deps);
    await expect(svc.remove('A', 'c1', 'missing')).rejects.toMatchObject({ status: 404 });
  });

  it('remove не бросает, если repo.remove=true', async () => {
    const svc = makePackagesService(fakeRepo({ remove: vi.fn(() => Promise.resolve(true)) }), deps);
    await expect(svc.remove('A', 'c1', 'p1')).resolves.toBeUndefined();
  });
});
