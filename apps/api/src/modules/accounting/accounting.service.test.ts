import { describe, it, expect, vi } from 'vitest';
import type { AccountingRepo, GymRow, ExpenseRow, IncomeRow } from './accounting.repo.js';
import { makeAccountingService } from './accounting.service.js';

function gymRow(over: Partial<GymRow> = {}): GymRow {
  return {
    id: 'g1',
    trainerId: 'A',
    name: 'Зал',
    monthlyRent: null,
    note: null,
    createdAt: new Date(0),
    ...over,
  };
}

function expenseRow(over: Partial<ExpenseRow> = {}): ExpenseRow {
  return {
    id: 'e1',
    trainerId: 'A',
    category: 'Аренда',
    amount: 100,
    date: '2026-06-01',
    gymId: null,
    clientId: null,
    note: null,
    createdAt: new Date(0),
    ...over,
  };
}

function incomeRow(over: Partial<IncomeRow> = {}): IncomeRow {
  return {
    id: 'i1',
    trainerId: 'A',
    category: 'Тренировки',
    amount: 200,
    date: '2026-06-01',
    clientId: null,
    note: null,
    createdAt: new Date(0),
    ...over,
  };
}

function fakeRepo(over: Partial<AccountingRepo> = {}): AccountingRepo {
  return {
    gymBelongsToTrainer: vi.fn(() => Promise.resolve(true)),
    isClientLinked: vi.fn(() => Promise.resolve(true)),
    getGym: vi.fn(() => Promise.resolve(null)),
    createGym: vi.fn(() => Promise.resolve(gymRow())),
    listGyms: vi.fn(() => Promise.resolve([])),
    updateGym: vi.fn(() => Promise.resolve(null)),
    deleteGym: vi.fn(() => Promise.resolve(false)),
    getExpense: vi.fn(() => Promise.resolve(null)),
    createExpense: vi.fn(() => Promise.resolve(expenseRow())),
    listExpenses: vi.fn(() => Promise.resolve([])),
    updateExpense: vi.fn(() => Promise.resolve(null)),
    deleteExpense: vi.fn(() => Promise.resolve(false)),
    getIncome: vi.fn(() => Promise.resolve(null)),
    createIncome: vi.fn(() => Promise.resolve(incomeRow())),
    listIncomes: vi.fn(() => Promise.resolve([])),
    updateIncome: vi.fn(() => Promise.resolve(null)),
    deleteIncome: vi.fn(() => Promise.resolve(false)),
    summary: vi.fn(() => Promise.resolve({ totalIncome: 0, totalExpense: 0, balance: 0 })),
    ...over,
  };
}

describe('accounting.service', () => {
  it('createGym генерирует id и зовёт repo', async () => {
    const createGym = vi.fn(() => Promise.resolve(gymRow({ name: 'Зал №1' })));
    const svc = makeAccountingService(fakeRepo({ createGym }), { newId: () => 'newid' });
    const res = await svc.createGym('A', { name: 'Зал №1' });
    expect(res.name).toBe('Зал №1');
    expect(createGym).toHaveBeenCalledWith('A', expect.objectContaining({ id: 'newid' }));
  });

  it('getGym → 404 если не найден', async () => {
    const svc = makeAccountingService(fakeRepo(), { newId: () => 'x' });
    await expect(svc.getGym('A', 'missing')).rejects.toMatchObject({ status: 404 });
  });

  it('updateGym/removeGym несуществующего → 404', async () => {
    const svc = makeAccountingService(fakeRepo(), { newId: () => 'x' });
    await expect(svc.updateGym('A', 'g1', { name: 'X' })).rejects.toMatchObject({ status: 404 });
    await expect(svc.removeGym('A', 'g1')).rejects.toMatchObject({ status: 404 });
  });

  it('createExpense с чужим gym → 400 GYM_NOT_FOUND, repo.createExpense не вызван', async () => {
    const createExpense = vi.fn(() => Promise.resolve(expenseRow()));
    const svc = makeAccountingService(
      fakeRepo({ gymBelongsToTrainer: vi.fn(() => Promise.resolve(false)), createExpense }),
      { newId: () => 'x' },
    );
    await expect(
      svc.createExpense('A', { category: 'X', amount: 10, date: '2026-06-01', gymId: 'g9' }),
    ).rejects.toMatchObject({ status: 400, code: 'GYM_NOT_FOUND' });
    expect(createExpense).not.toHaveBeenCalled();
  });

  it('createExpense с несвязанным клиентом → 400 CLIENT_NOT_LINKED', async () => {
    const createExpense = vi.fn(() => Promise.resolve(expenseRow()));
    const svc = makeAccountingService(
      fakeRepo({ isClientLinked: vi.fn(() => Promise.resolve(false)), createExpense }),
      { newId: () => 'x' },
    );
    await expect(
      svc.createExpense('A', { category: 'X', amount: 10, date: '2026-06-01', clientId: 'c9' }),
    ).rejects.toMatchObject({ status: 400, code: 'CLIENT_NOT_LINKED' });
    expect(createExpense).not.toHaveBeenCalled();
  });

  it('createExpense без привязок не проверяет ничего и создаёт', async () => {
    const gymBelongsToTrainer = vi.fn(() => Promise.resolve(true));
    const svc = makeAccountingService(fakeRepo({ gymBelongsToTrainer }), { newId: () => 'x' });
    const res = await svc.createExpense('A', { category: 'X', amount: 50, date: '2026-06-01' });
    expect(res.amount).toBe(100); // из expenseRow()
    expect(gymBelongsToTrainer).not.toHaveBeenCalled();
  });

  it('updateExpense существующего с чужим gym → 400, repo.updateExpense не вызван', async () => {
    const updateExpense = vi.fn(() => Promise.resolve(expenseRow()));
    const svc = makeAccountingService(
      fakeRepo({
        getExpense: vi.fn(() => Promise.resolve(expenseRow())),
        gymBelongsToTrainer: vi.fn(() => Promise.resolve(false)),
        updateExpense,
      }),
      { newId: () => 'x' },
    );
    await expect(svc.updateExpense('A', 'e1', { gymId: 'g9' })).rejects.toMatchObject({
      status: 400,
      code: 'GYM_NOT_FOUND',
    });
    expect(updateExpense).not.toHaveBeenCalled();
  });

  it('updateExpense несуществующего → 404 раньше проверки ссылок (даже при битом gymId)', async () => {
    const gymBelongsToTrainer = vi.fn(() => Promise.resolve(false));
    const updateExpense = vi.fn(() => Promise.resolve(null));
    const svc = makeAccountingService(
      // getExpense → null (нет расхода); ссылки заведомо битые.
      fakeRepo({
        getExpense: vi.fn(() => Promise.resolve(null)),
        gymBelongsToTrainer,
        updateExpense,
      }),
      { newId: () => 'x' },
    );
    await expect(svc.updateExpense('A', 'missing', { gymId: 'g9' })).rejects.toMatchObject({
      status: 404,
    });
    // 404 раньше: проверка ссылок и repo.updateExpense не вызывались.
    expect(gymBelongsToTrainer).not.toHaveBeenCalled();
    expect(updateExpense).not.toHaveBeenCalled();
  });

  it('getExpense → 404 если не найден', async () => {
    const svc = makeAccountingService(fakeRepo(), { newId: () => 'x' });
    await expect(svc.getExpense('A', 'missing')).rejects.toMatchObject({ status: 404 });
  });

  it('createIncome генерирует id и маппит createdAt в строку', async () => {
    const svc = makeAccountingService(fakeRepo(), { newId: () => 'x' });
    const res = await svc.createIncome('A', { category: 'Y', amount: 200, date: '2026-06-01' });
    expect(res.amount).toBe(200);
    expect(typeof res.createdAt).toBe('string');
  });

  it('createIncome без clientId → ответ с clientId=null, проверка связи не зовётся', async () => {
    const isClientLinked = vi.fn(() => Promise.resolve(true));
    const svc = makeAccountingService(fakeRepo({ isClientLinked }), { newId: () => 'x' });
    const res = await svc.createIncome('A', { category: 'Y', amount: 200, date: '2026-06-01' });
    expect(res.clientId).toBeNull(); // из incomeRow()
    expect(isClientLinked).not.toHaveBeenCalled();
  });

  it('createIncome с clientId прокидывает clientId и проверяет связь', async () => {
    const createIncome = vi.fn(() => Promise.resolve(incomeRow({ clientId: 'c1' })));
    const svc = makeAccountingService(fakeRepo({ createIncome }), { newId: () => 'x' });
    const res = await svc.createIncome('A', {
      category: 'Y',
      amount: 200,
      date: '2026-06-01',
      clientId: 'c1',
    });
    expect(res.clientId).toBe('c1');
    expect(createIncome).toHaveBeenCalledWith('A', expect.objectContaining({ clientId: 'c1' }));
  });

  it('createIncome с несвязанным клиентом → 400 CLIENT_NOT_LINKED, repo.createIncome не вызван', async () => {
    const createIncome = vi.fn(() => Promise.resolve(incomeRow()));
    const svc = makeAccountingService(
      fakeRepo({ isClientLinked: vi.fn(() => Promise.resolve(false)), createIncome }),
      { newId: () => 'x' },
    );
    await expect(
      svc.createIncome('A', { category: 'Y', amount: 200, date: '2026-06-01', clientId: 'c9' }),
    ).rejects.toMatchObject({ status: 400, code: 'CLIENT_NOT_LINKED' });
    expect(createIncome).not.toHaveBeenCalled();
  });

  it('getIncome/updateIncome/removeIncome несуществующего → 404', async () => {
    const svc = makeAccountingService(fakeRepo(), { newId: () => 'x' });
    await expect(svc.getIncome('A', 'm')).rejects.toMatchObject({ status: 404 });
    await expect(svc.updateIncome('A', 'm', { amount: 1 })).rejects.toMatchObject({ status: 404 });
    await expect(svc.removeIncome('A', 'm')).rejects.toMatchObject({ status: 404 });
  });

  it('summary возвращает суммы из repo и эхо from/to', async () => {
    const summary = vi.fn(() =>
      Promise.resolve({ totalIncome: 500, totalExpense: 200, balance: 300 }),
    );
    const svc = makeAccountingService(fakeRepo({ summary }), { newId: () => 'x' });
    const res = await svc.summary('A', { from: '2026-06-01', to: '2026-06-30' });
    expect(res).toEqual({
      from: '2026-06-01',
      to: '2026-06-30',
      totalIncome: 500,
      totalExpense: 200,
      balance: 300,
    });
    expect(summary).toHaveBeenCalledWith('A', { from: '2026-06-01', to: '2026-06-30' });
  });
});
