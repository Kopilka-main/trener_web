import { and, asc, desc, eq, gte, lte, ne, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { gyms, expenses, incomes, paymentPackages, trainerClients } from '../../db/schema.js';

// --- Строки БД ---

export type GymRow = {
  id: string;
  trainerId: string;
  name: string;
  monthlyRent: number | null;
  note: string | null;
  createdAt: Date;
};

export type ExpenseRow = {
  id: string;
  trainerId: string;
  category: string;
  amount: number;
  date: string;
  gymId: string | null;
  clientId: string | null;
  note: string | null;
  tags: string[];
  createdAt: Date;
};

export type IncomeRow = {
  id: string;
  trainerId: string;
  category: string;
  amount: number;
  date: string;
  clientId: string | null;
  note: string | null;
  tags: string[];
  // Доп. детализация для синтетических строк-пакетов (иначе null).
  title: string | null;
  subtitle: string | null;
  createdAt: Date;
};

// --- Входы ---

export type CreateGymInput = {
  id: string;
  name: string;
  monthlyRent?: number | null;
  note?: string | null;
};

export type GymPatchInput = {
  name?: string;
  monthlyRent?: number | null;
  note?: string | null;
};

export type CreateExpenseInput = {
  id: string;
  category: string;
  amount: number;
  date: string;
  gymId?: string | null;
  clientId?: string | null;
  note?: string | null;
  tags?: string[];
};

export type ExpensePatchInput = {
  category?: string;
  amount?: number;
  date?: string;
  gymId?: string | null;
  clientId?: string | null;
  note?: string | null;
  tags?: string[];
};

export type CreateIncomeInput = {
  id: string;
  category: string;
  amount: number;
  date: string;
  clientId?: string | null;
  note?: string | null;
  tags?: string[];
};

export type IncomePatchInput = {
  category?: string;
  amount?: number;
  date?: string;
  clientId?: string | null;
  note?: string | null;
  tags?: string[];
};

export type DateRange = { from?: string; to?: string };
export type SummaryTotals = { totalIncome: number; totalExpense: number; balance: number };

const gymCols = {
  id: gyms.id,
  trainerId: gyms.trainerId,
  name: gyms.name,
  monthlyRent: gyms.monthlyRent,
  note: gyms.note,
  createdAt: gyms.createdAt,
};

const expenseCols = {
  id: expenses.id,
  trainerId: expenses.trainerId,
  category: expenses.category,
  amount: expenses.amount,
  date: expenses.date,
  gymId: expenses.gymId,
  clientId: expenses.clientId,
  note: expenses.note,
  tags: expenses.tags,
  createdAt: expenses.createdAt,
};

const incomeCols = {
  id: incomes.id,
  trainerId: incomes.trainerId,
  category: incomes.category,
  amount: incomes.amount,
  date: incomes.date,
  clientId: incomes.clientId,
  note: incomes.note,
  tags: incomes.tags,
  createdAt: incomes.createdAt,
};

/** Строка таблицы incomes → IncomeRow (title/subtitle для ручных доходов = null). */
function toIncomeRow(r: {
  id: string;
  trainerId: string;
  category: string;
  amount: number;
  date: string;
  clientId: string | null;
  note: string | null;
  tags: string[];
  createdAt: Date;
}): IncomeRow {
  return { ...r, title: null, subtitle: null };
}

// Репозиторий бухгалтерии: scoped по trainerId, покрывает gyms/expenses/incomes + summary.
// HTTP-слой не импортирует. Связь клиента проверяется прямым запросом к trainer_clients.
export function makeAccountingRepo(db: Db) {
  // --- Проверки принадлежности (для expense.gymId/clientId) ---

  async function gymBelongsToTrainer(trainerId: string, gymId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: gyms.id })
      .from(gyms)
      .where(and(eq(gyms.id, gymId), eq(gyms.trainerId, trainerId)));
    return !!row;
  }

  async function isClientLinked(trainerId: string, clientId: string): Promise<boolean> {
    const [row] = await db
      .select({ clientId: trainerClients.clientId })
      .from(trainerClients)
      .where(and(eq(trainerClients.trainerId, trainerId), eq(trainerClients.clientId, clientId)));
    return !!row;
  }

  // Проданные пакеты (кроме отменённых) как доходные строки. Дата дохода — startsAt.
  async function listPackageIncome(trainerId: string, range: DateRange): Promise<IncomeRow[]> {
    const conds = [
      eq(paymentPackages.trainerId, trainerId),
      ne(paymentPackages.status, 'cancelled'),
    ];
    if (range.from !== undefined) conds.push(gte(paymentPackages.startsAt, range.from));
    if (range.to !== undefined) conds.push(lte(paymentPackages.startsAt, range.to));
    const rows = await db
      .select({
        id: paymentPackages.id,
        lessonsPaid: paymentPackages.lessonsPaid,
        totalPaid: paymentPackages.totalPaid,
        workoutType: paymentPackages.workoutType,
        startsAt: paymentPackages.startsAt,
        clientId: paymentPackages.clientId,
        note: paymentPackages.note,
        tags: paymentPackages.tags,
        createdAt: paymentPackages.createdAt,
      })
      .from(paymentPackages)
      .where(and(...conds));
    return rows.map((p): IncomeRow => {
      const type = p.workoutType?.trim();
      return {
        id: `pkg:${p.id}`,
        trainerId,
        category: 'Пакет тренировок',
        amount: p.totalPaid,
        date: p.startsAt,
        clientId: p.clientId,
        note: p.note,
        tags: p.tags,
        title: type && type !== '' ? type : null,
        subtitle: `${String(p.lessonsPaid)} трен.`,
        createdAt: p.createdAt,
      };
    });
  }

  // --- Gyms ---

  async function getGymLocal(trainerId: string, id: string): Promise<GymRow | null> {
    const [row] = await db
      .select(gymCols)
      .from(gyms)
      .where(and(eq(gyms.id, id), eq(gyms.trainerId, trainerId)));
    return row ?? null;
  }

  return {
    gymBelongsToTrainer,
    isClientLinked,

    getGym: getGymLocal,

    async createGym(trainerId: string, input: CreateGymInput): Promise<GymRow> {
      const [row] = await db
        .insert(gyms)
        .values({
          id: input.id,
          trainerId,
          name: input.name,
          monthlyRent: input.monthlyRent ?? null,
          note: input.note ?? null,
        })
        .returning(gymCols);
      if (!row) throw new Error('insert failed');
      return row;
    },

    async listGyms(trainerId: string): Promise<GymRow[]> {
      return db
        .select(gymCols)
        .from(gyms)
        .where(eq(gyms.trainerId, trainerId))
        .orderBy(asc(gyms.name));
    },

    async updateGym(trainerId: string, id: string, patch: GymPatchInput): Promise<GymRow | null> {
      if (Object.keys(patch).length === 0) return getGymLocal(trainerId, id);
      const [row] = await db
        .update(gyms)
        .set(patch)
        .where(and(eq(gyms.id, id), eq(gyms.trainerId, trainerId)))
        .returning(gymCols);
      return row ?? null;
    },

    async deleteGym(trainerId: string, id: string): Promise<boolean> {
      const res = await db
        .delete(gyms)
        .where(and(eq(gyms.id, id), eq(gyms.trainerId, trainerId)))
        .returning({ id: gyms.id });
      return res.length > 0;
    },

    // --- Expenses ---

    async getExpense(trainerId: string, id: string): Promise<ExpenseRow | null> {
      const [row] = await db
        .select(expenseCols)
        .from(expenses)
        .where(and(eq(expenses.id, id), eq(expenses.trainerId, trainerId)));
      return row ?? null;
    },

    async createExpense(trainerId: string, input: CreateExpenseInput): Promise<ExpenseRow> {
      const [row] = await db
        .insert(expenses)
        .values({
          id: input.id,
          trainerId,
          category: input.category,
          amount: input.amount,
          date: input.date,
          gymId: input.gymId ?? null,
          clientId: input.clientId ?? null,
          note: input.note ?? null,
          tags: input.tags ?? [],
        })
        .returning(expenseCols);
      if (!row) throw new Error('insert failed');
      return row;
    },

    // Расходы тренера, опц. фильтр по диапазону дат [from..to], сорт по date desc, createdAt desc.
    async listExpenses(trainerId: string, range: DateRange = {}): Promise<ExpenseRow[]> {
      const conds = [eq(expenses.trainerId, trainerId)];
      if (range.from !== undefined) conds.push(gte(expenses.date, range.from));
      if (range.to !== undefined) conds.push(lte(expenses.date, range.to));
      return db
        .select(expenseCols)
        .from(expenses)
        .where(and(...conds))
        .orderBy(desc(expenses.date), desc(expenses.createdAt));
    },

    async updateExpense(
      trainerId: string,
      id: string,
      patch: ExpensePatchInput,
    ): Promise<ExpenseRow | null> {
      if (Object.keys(patch).length === 0) {
        const [row] = await db
          .select(expenseCols)
          .from(expenses)
          .where(and(eq(expenses.id, id), eq(expenses.trainerId, trainerId)));
        return row ?? null;
      }
      const [row] = await db
        .update(expenses)
        .set(patch)
        .where(and(eq(expenses.id, id), eq(expenses.trainerId, trainerId)))
        .returning(expenseCols);
      return row ?? null;
    },

    async deleteExpense(trainerId: string, id: string): Promise<boolean> {
      const res = await db
        .delete(expenses)
        .where(and(eq(expenses.id, id), eq(expenses.trainerId, trainerId)))
        .returning({ id: expenses.id });
      return res.length > 0;
    },

    // --- Incomes ---

    async getIncome(trainerId: string, id: string): Promise<IncomeRow | null> {
      const [row] = await db
        .select(incomeCols)
        .from(incomes)
        .where(and(eq(incomes.id, id), eq(incomes.trainerId, trainerId)));
      return row ? toIncomeRow(row) : null;
    },

    async createIncome(trainerId: string, input: CreateIncomeInput): Promise<IncomeRow> {
      const [row] = await db
        .insert(incomes)
        .values({
          id: input.id,
          trainerId,
          category: input.category,
          amount: input.amount,
          date: input.date,
          clientId: input.clientId ?? null,
          note: input.note ?? null,
          tags: input.tags ?? [],
        })
        .returning(incomeCols);
      if (!row) throw new Error('insert failed');
      return toIncomeRow(row);
    },

    async listIncomes(trainerId: string, range: DateRange = {}): Promise<IncomeRow[]> {
      const conds = [eq(incomes.trainerId, trainerId)];
      if (range.from !== undefined) conds.push(gte(incomes.date, range.from));
      if (range.to !== undefined) conds.push(lte(incomes.date, range.to));
      const manual = (
        await db
          .select(incomeCols)
          .from(incomes)
          .where(and(...conds))
      ).map(toIncomeRow);

      // Проданные пакеты тренировок — тоже доход. Отдаём их синтетическими строками
      // с id `pkg:<id>`, чтобы клиент мог отличить их и удалять через packages API.
      const pkgRows = await listPackageIncome(trainerId, range);

      const merged = [...manual, ...pkgRows];
      merged.sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return a.createdAt < b.createdAt ? 1 : -1;
      });
      return merged;
    },

    async updateIncome(
      trainerId: string,
      id: string,
      patch: IncomePatchInput,
    ): Promise<IncomeRow | null> {
      if (Object.keys(patch).length === 0) {
        const [row] = await db
          .select(incomeCols)
          .from(incomes)
          .where(and(eq(incomes.id, id), eq(incomes.trainerId, trainerId)));
        return row ? toIncomeRow(row) : null;
      }
      const [row] = await db
        .update(incomes)
        .set(patch)
        .where(and(eq(incomes.id, id), eq(incomes.trainerId, trainerId)))
        .returning(incomeCols);
      return row ? toIncomeRow(row) : null;
    },

    async deleteIncome(trainerId: string, id: string): Promise<boolean> {
      const res = await db
        .delete(incomes)
        .where(and(eq(incomes.id, id), eq(incomes.trainerId, trainerId)))
        .returning({ id: incomes.id });
      return res.length > 0;
    },

    // --- Summary: суммы доход/расход/баланс за период [from..to] ---
    // COALESCE(SUM(amount), 0) на стороне БД; результат кастуем в float8::text → Number,
    // чтобы не зависеть от драйверного маппинга numeric (postgres-js может вернуть строку).
    async summary(trainerId: string, range: DateRange): Promise<SummaryTotals> {
      const incomeConds = [eq(incomes.trainerId, trainerId)];
      if (range.from !== undefined) incomeConds.push(gte(incomes.date, range.from));
      if (range.to !== undefined) incomeConds.push(lte(incomes.date, range.to));

      const expenseConds = [eq(expenses.trainerId, trainerId)];
      if (range.from !== undefined) expenseConds.push(gte(expenses.date, range.from));
      if (range.to !== undefined) expenseConds.push(lte(expenses.date, range.to));

      const pkgConds = [
        eq(paymentPackages.trainerId, trainerId),
        ne(paymentPackages.status, 'cancelled'),
      ];
      if (range.from !== undefined) pkgConds.push(gte(paymentPackages.startsAt, range.from));
      if (range.to !== undefined) pkgConds.push(lte(paymentPackages.startsAt, range.to));

      const [incRow] = await db
        .select({ total: sql<string>`COALESCE(SUM(${incomes.amount}), 0)::float8::text` })
        .from(incomes)
        .where(and(...incomeConds));
      const [expRow] = await db
        .select({ total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)::float8::text` })
        .from(expenses)
        .where(and(...expenseConds));
      const [pkgRow] = await db
        .select({
          total: sql<string>`COALESCE(SUM(${paymentPackages.totalPaid}), 0)::float8::text`,
        })
        .from(paymentPackages)
        .where(and(...pkgConds));

      const totalIncome = Number(incRow?.total ?? '0') + Number(pkgRow?.total ?? '0');
      const totalExpense = Number(expRow?.total ?? '0');
      return { totalIncome, totalExpense, balance: totalIncome - totalExpense };
    },
  };
}

export type AccountingRepo = ReturnType<typeof makeAccountingRepo>;
