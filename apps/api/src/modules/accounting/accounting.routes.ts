import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createGymRequestSchema,
  updateGymRequestSchema,
  gymResponseSchema,
  gymListResponseSchema,
  createExpenseRequestSchema,
  updateExpenseRequestSchema,
  expenseResponseSchema,
  expenseListResponseSchema,
  createIncomeRequestSchema,
  updateIncomeRequestSchema,
  incomeResponseSchema,
  incomeListResponseSchema,
  accountingSummaryResponseSchema,
} from '@trener/shared';
import type { AccountingService } from './accounting.service.js';
import { requireAuth } from '../../plugins/tenant-context.js';
import { unauthorized } from '../../errors.js';

const idParams = z.object({ id: z.string() });
const gymWrap = z.object({ gym: gymResponseSchema });
const expenseWrap = z.object({ expense: expenseResponseSchema });
const incomeWrap = z.object({ income: incomeResponseSchema });

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
// Фильтр диапазона дат: оба поля опциональны (YYYY-MM-DD).
const listQuery = z.object({ from: dateStr.optional(), to: dateStr.optional() });
// Summary: from/to обязательны (период обязан быть задан для осмысленной сводки).
const summaryQuery = z.object({ from: dateStr, to: dateStr });

// HTTP-слой accounting: только роуты. Сборка repo/service — в accounting.module.ts
// (граница слоёв: *.routes.ts не импортирует *.repo/**/db). Верхнеуровневый у тренера.
export function accountingRoutes(app: FastifyInstance, svc: AccountingService): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  function trainerId(req: { trainerId?: string }): string {
    if (!req.trainerId) throw unauthorized('Требуется вход');
    return req.trainerId;
  }

  function range(q: { from?: string | undefined; to?: string | undefined }): {
    from?: string;
    to?: string;
  } {
    const r: { from?: string; to?: string } = {};
    if (q.from !== undefined) r.from = q.from;
    if (q.to !== undefined) r.to = q.to;
    return r;
  }

  // --- Gyms ---

  typed.get(
    '/api/gyms',
    { preHandler: requireAuth, schema: { response: { 200: gymListResponseSchema } } },
    async (req) => ({ gyms: await svc.listGyms(trainerId(req)) }),
  );

  typed.get(
    '/api/gyms/:id',
    { preHandler: requireAuth, schema: { params: idParams, response: { 200: gymWrap } } },
    async (req) => ({ gym: await svc.getGym(trainerId(req), req.params.id) }),
  );

  typed.post(
    '/api/gyms',
    {
      preHandler: requireAuth,
      schema: { body: createGymRequestSchema, response: { 201: gymWrap } },
    },
    async (req, reply) => {
      const gym = await svc.createGym(trainerId(req), req.body);
      void reply.status(201);
      return { gym };
    },
  );

  typed.patch(
    '/api/gyms/:id',
    {
      preHandler: requireAuth,
      schema: { params: idParams, body: updateGymRequestSchema, response: { 200: gymWrap } },
    },
    async (req) => ({ gym: await svc.updateGym(trainerId(req), req.params.id, req.body) }),
  );

  typed.delete(
    '/api/gyms/:id',
    {
      preHandler: requireAuth,
      schema: { params: idParams, response: { 200: z.object({ ok: z.literal(true) }) } },
    },
    async (req) => {
      await svc.removeGym(trainerId(req), req.params.id);
      return { ok: true as const };
    },
  );

  // --- Expenses ---

  typed.get(
    '/api/expenses',
    {
      preHandler: requireAuth,
      schema: { querystring: listQuery, response: { 200: expenseListResponseSchema } },
    },
    async (req) => ({ expenses: await svc.listExpenses(trainerId(req), range(req.query)) }),
  );

  typed.get(
    '/api/expenses/:id',
    { preHandler: requireAuth, schema: { params: idParams, response: { 200: expenseWrap } } },
    async (req) => ({ expense: await svc.getExpense(trainerId(req), req.params.id) }),
  );

  typed.post(
    '/api/expenses',
    {
      preHandler: requireAuth,
      schema: { body: createExpenseRequestSchema, response: { 201: expenseWrap } },
    },
    async (req, reply) => {
      const expense = await svc.createExpense(trainerId(req), req.body);
      void reply.status(201);
      return { expense };
    },
  );

  typed.patch(
    '/api/expenses/:id',
    {
      preHandler: requireAuth,
      schema: {
        params: idParams,
        body: updateExpenseRequestSchema,
        response: { 200: expenseWrap },
      },
    },
    async (req) => ({
      expense: await svc.updateExpense(trainerId(req), req.params.id, req.body),
    }),
  );

  typed.delete(
    '/api/expenses/:id',
    {
      preHandler: requireAuth,
      schema: { params: idParams, response: { 200: z.object({ ok: z.literal(true) }) } },
    },
    async (req) => {
      await svc.removeExpense(trainerId(req), req.params.id);
      return { ok: true as const };
    },
  );

  // --- Incomes ---

  typed.get(
    '/api/incomes',
    {
      preHandler: requireAuth,
      schema: { querystring: listQuery, response: { 200: incomeListResponseSchema } },
    },
    async (req) => ({ incomes: await svc.listIncomes(trainerId(req), range(req.query)) }),
  );

  typed.get(
    '/api/incomes/:id',
    { preHandler: requireAuth, schema: { params: idParams, response: { 200: incomeWrap } } },
    async (req) => ({ income: await svc.getIncome(trainerId(req), req.params.id) }),
  );

  typed.post(
    '/api/incomes',
    {
      preHandler: requireAuth,
      schema: { body: createIncomeRequestSchema, response: { 201: incomeWrap } },
    },
    async (req, reply) => {
      const income = await svc.createIncome(trainerId(req), req.body);
      void reply.status(201);
      return { income };
    },
  );

  typed.patch(
    '/api/incomes/:id',
    {
      preHandler: requireAuth,
      schema: { params: idParams, body: updateIncomeRequestSchema, response: { 200: incomeWrap } },
    },
    async (req) => ({ income: await svc.updateIncome(trainerId(req), req.params.id, req.body) }),
  );

  typed.delete(
    '/api/incomes/:id',
    {
      preHandler: requireAuth,
      schema: { params: idParams, response: { 200: z.object({ ok: z.literal(true) }) } },
    },
    async (req) => {
      await svc.removeIncome(trainerId(req), req.params.id);
      return { ok: true as const };
    },
  );

  // --- Summary ---

  typed.get(
    '/api/accounting/summary',
    {
      preHandler: requireAuth,
      schema: { querystring: summaryQuery, response: { 200: accountingSummaryResponseSchema } },
    },
    async (req) => svc.summary(trainerId(req), { from: req.query.from, to: req.query.to }),
  );
}
