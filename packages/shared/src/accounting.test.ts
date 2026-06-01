import { describe, it, expect } from 'vitest';
import {
  createGymRequestSchema,
  updateGymRequestSchema,
  createExpenseRequestSchema,
  updateExpenseRequestSchema,
  createIncomeRequestSchema,
  accountingSummaryResponseSchema,
} from './accounting.js';

describe('accounting schemas', () => {
  it('createGym тримит name, принимает nullish monthlyRent/note', () => {
    const r = createGymRequestSchema.parse({ name: '  Зал №1  ' });
    expect(r.name).toBe('Зал №1');
    const r2 = createGymRequestSchema.parse({ name: 'Зал', monthlyRent: 30000, note: null });
    expect(r2.monthlyRent).toBe(30000);
  });

  it('createGym отклоняет пустое имя и неположительную аренду', () => {
    expect(() => createGymRequestSchema.parse({ name: '   ' })).toThrow();
    expect(() => createGymRequestSchema.parse({ name: 'Зал', monthlyRent: -1 })).toThrow();
  });

  it('updateGym допускает частичные поля', () => {
    const r = updateGymRequestSchema.parse({ name: 'Новый зал' });
    expect(r.name).toBe('Новый зал');
    expect(r.monthlyRent).toBeUndefined();
  });

  it('createExpense принимает валидные поля + nullish привязки', () => {
    const r = createExpenseRequestSchema.parse({
      category: 'Аренда',
      amount: 30000,
      date: '2026-06-01',
      gymId: 'g1',
      clientId: null,
    });
    expect(r.category).toBe('Аренда');
    expect(r.amount).toBe(30000);
    expect(r.gymId).toBe('g1');
  });

  it('createExpense отклоняет неположительную сумму и невалидную дату', () => {
    expect(() =>
      createExpenseRequestSchema.parse({ category: 'X', amount: 0, date: '2026-06-01' }),
    ).toThrow();
    expect(() =>
      createExpenseRequestSchema.parse({ category: 'X', amount: 10, date: '01-06-2026' }),
    ).toThrow();
  });

  it('updateExpense допускает частичные поля', () => {
    const r = updateExpenseRequestSchema.parse({ amount: 500 });
    expect(r.amount).toBe(500);
    expect(r.category).toBeUndefined();
  });

  it('createIncome принимает валидные поля', () => {
    const r = createIncomeRequestSchema.parse({
      category: 'Тренировки',
      amount: 5000,
      date: '2026-06-01',
    });
    expect(r.amount).toBe(5000);
  });

  it('createIncome отклоняет пустую категорию', () => {
    expect(() =>
      createIncomeRequestSchema.parse({ category: '  ', amount: 100, date: '2026-06-01' }),
    ).toThrow();
  });

  it('summary-схема валидирует форму ответа', () => {
    const r = accountingSummaryResponseSchema.parse({
      from: '2026-06-01',
      to: '2026-06-30',
      totalIncome: 100,
      totalExpense: 40,
      balance: 60,
    });
    expect(r.balance).toBe(60);
  });
});
