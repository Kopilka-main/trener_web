import type {
  AccountingRepo,
  GymRow,
  ExpenseRow,
  IncomeRow,
  CreateGymInput,
  GymPatchInput,
  CreateExpenseInput,
  ExpensePatchInput,
  CreateIncomeInput,
  IncomePatchInput,
  DateRange,
} from './accounting.repo.js';
import type {
  CreateGymRequest,
  UpdateGymRequest,
  GymResponse,
  CreateExpenseRequest,
  UpdateExpenseRequest,
  ExpenseResponse,
  CreateIncomeRequest,
  UpdateIncomeRequest,
  IncomeResponse,
  AccountingSummaryResponse,
} from '@trener/shared';
import { AppError, notFound } from '../../errors.js';

export type AccountingDeps = { newId: () => string };

// Чужой зал в expense.gymId → 400 GYM_NOT_FOUND; несвязанный клиент → 400 CLIENT_NOT_LINKED.
// Раздельные коды (а не общий INVALID_REF) — чтобы UI/диагностика различали причину.
const gymNotFound = () => new AppError(400, 'GYM_NOT_FOUND', 'Зал не найден или не ваш');
const clientNotLinked = () => new AppError(400, 'CLIENT_NOT_LINKED', 'Клиент не связан с тренером');

function gymToResponse(r: GymRow): GymResponse {
  return {
    id: r.id,
    name: r.name,
    monthlyRent: r.monthlyRent,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
  };
}

function expenseToResponse(r: ExpenseRow): ExpenseResponse {
  return {
    id: r.id,
    category: r.category,
    amount: r.amount,
    date: r.date,
    gymId: r.gymId,
    clientId: r.clientId,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
  };
}

function incomeToResponse(r: IncomeRow): IncomeResponse {
  return {
    id: r.id,
    category: r.category,
    amount: r.amount,
    date: r.date,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
  };
}

export function makeAccountingService(repo: AccountingRepo, deps: AccountingDeps) {
  // Проверка привязок expense (gym принадлежит тренеру; клиент связан) для не-null значений.
  async function assertExpenseRefs(
    trainerId: string,
    gymId: string | null | undefined,
    clientId: string | null | undefined,
  ): Promise<void> {
    if (gymId != null && !(await repo.gymBelongsToTrainer(trainerId, gymId))) throw gymNotFound();
    if (clientId != null && !(await repo.isClientLinked(trainerId, clientId)))
      throw clientNotLinked();
  }

  return {
    // --- Gyms ---

    async createGym(trainerId: string, input: CreateGymRequest): Promise<GymResponse> {
      const data: CreateGymInput = { id: deps.newId(), name: input.name };
      if (input.monthlyRent !== undefined) data.monthlyRent = input.monthlyRent ?? null;
      if (input.note !== undefined) data.note = input.note ?? null;
      return gymToResponse(await repo.createGym(trainerId, data));
    },

    async listGyms(trainerId: string): Promise<GymResponse[]> {
      return (await repo.listGyms(trainerId)).map(gymToResponse);
    },

    async getGym(trainerId: string, id: string): Promise<GymResponse> {
      const row = await repo.getGym(trainerId, id);
      if (!row) throw notFound('Зал не найден');
      return gymToResponse(row);
    },

    async updateGym(trainerId: string, id: string, input: UpdateGymRequest): Promise<GymResponse> {
      const patch: GymPatchInput = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.monthlyRent !== undefined) patch.monthlyRent = input.monthlyRent ?? null;
      if (input.note !== undefined) patch.note = input.note ?? null;
      const row = await repo.updateGym(trainerId, id, patch);
      if (!row) throw notFound('Зал не найден');
      return gymToResponse(row);
    },

    async removeGym(trainerId: string, id: string): Promise<void> {
      const ok = await repo.deleteGym(trainerId, id);
      if (!ok) throw notFound('Зал не найден');
    },

    // --- Expenses ---

    async createExpense(trainerId: string, input: CreateExpenseRequest): Promise<ExpenseResponse> {
      await assertExpenseRefs(trainerId, input.gymId, input.clientId);
      const data: CreateExpenseInput = {
        id: deps.newId(),
        category: input.category,
        amount: input.amount,
        date: input.date,
      };
      if (input.gymId !== undefined) data.gymId = input.gymId ?? null;
      if (input.clientId !== undefined) data.clientId = input.clientId ?? null;
      if (input.note !== undefined) data.note = input.note ?? null;
      return expenseToResponse(await repo.createExpense(trainerId, data));
    },

    async listExpenses(trainerId: string, range: DateRange = {}): Promise<ExpenseResponse[]> {
      return (await repo.listExpenses(trainerId, range)).map(expenseToResponse);
    },

    async getExpense(trainerId: string, id: string): Promise<ExpenseResponse> {
      const row = await repo.getExpense(trainerId, id);
      if (!row) throw notFound('Расход не найден');
      return expenseToResponse(row);
    },

    async updateExpense(
      trainerId: string,
      id: string,
      input: UpdateExpenseRequest,
    ): Promise<ExpenseResponse> {
      // Сперва 404, если расхода нет (даже при битых ссылках в payload), затем проверка ссылок.
      if (!(await repo.getExpense(trainerId, id))) throw notFound('Расход не найден');
      await assertExpenseRefs(trainerId, input.gymId, input.clientId);
      const patch: ExpensePatchInput = {};
      if (input.category !== undefined) patch.category = input.category;
      if (input.amount !== undefined) patch.amount = input.amount;
      if (input.date !== undefined) patch.date = input.date;
      if (input.gymId !== undefined) patch.gymId = input.gymId ?? null;
      if (input.clientId !== undefined) patch.clientId = input.clientId ?? null;
      if (input.note !== undefined) patch.note = input.note ?? null;
      const row = await repo.updateExpense(trainerId, id, patch);
      if (!row) throw notFound('Расход не найден');
      return expenseToResponse(row);
    },

    async removeExpense(trainerId: string, id: string): Promise<void> {
      const ok = await repo.deleteExpense(trainerId, id);
      if (!ok) throw notFound('Расход не найден');
    },

    // --- Incomes ---

    async createIncome(trainerId: string, input: CreateIncomeRequest): Promise<IncomeResponse> {
      const data: CreateIncomeInput = {
        id: deps.newId(),
        category: input.category,
        amount: input.amount,
        date: input.date,
      };
      if (input.note !== undefined) data.note = input.note ?? null;
      return incomeToResponse(await repo.createIncome(trainerId, data));
    },

    async listIncomes(trainerId: string, range: DateRange = {}): Promise<IncomeResponse[]> {
      return (await repo.listIncomes(trainerId, range)).map(incomeToResponse);
    },

    async getIncome(trainerId: string, id: string): Promise<IncomeResponse> {
      const row = await repo.getIncome(trainerId, id);
      if (!row) throw notFound('Доход не найден');
      return incomeToResponse(row);
    },

    async updateIncome(
      trainerId: string,
      id: string,
      input: UpdateIncomeRequest,
    ): Promise<IncomeResponse> {
      const patch: IncomePatchInput = {};
      if (input.category !== undefined) patch.category = input.category;
      if (input.amount !== undefined) patch.amount = input.amount;
      if (input.date !== undefined) patch.date = input.date;
      if (input.note !== undefined) patch.note = input.note ?? null;
      const row = await repo.updateIncome(trainerId, id, patch);
      if (!row) throw notFound('Доход не найден');
      return incomeToResponse(row);
    },

    async removeIncome(trainerId: string, id: string): Promise<void> {
      const ok = await repo.deleteIncome(trainerId, id);
      if (!ok) throw notFound('Доход не найден');
    },

    // --- Summary ---

    async summary(trainerId: string, range: DateRange): Promise<AccountingSummaryResponse> {
      const totals = await repo.summary(trainerId, range);
      return {
        from: range.from ?? '',
        to: range.to ?? '',
        totalIncome: totals.totalIncome,
        totalExpense: totals.totalExpense,
        balance: totals.balance,
      };
    },
  };
}

export type AccountingService = ReturnType<typeof makeAccountingService>;
