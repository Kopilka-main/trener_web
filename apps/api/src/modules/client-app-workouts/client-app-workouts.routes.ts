import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { workoutResponseSchema, workoutListResponseSchema, type ClientLink } from '@trener/shared';
import type { ClientWorkoutsService } from '../client-workouts/client-workouts.service.js';
import { requireClient } from '../../plugins/client-context.js';
import { AppError, notFound, unauthorized } from '../../errors.js';

type ResolveScope = (clientAccountId: string) => Promise<ClientLink>;

const widParams = z.object({ wid: z.string() });
const workoutWrap = z.object({ workout: workoutResponseSchema });

export function clientAppWorkoutsRoutes(
  app: FastifyInstance,
  svc: ClientWorkoutsService,
  resolveScope: ResolveScope,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  async function scope(req: FastifyRequest): Promise<{ trainerId: string; clientId: string }> {
    if (!req.clientAccountId) throw unauthorized('Требуется вход');
    const link = await resolveScope(req.clientAccountId);
    if (!link) throw new AppError(409, 'NOT_LINKED', 'Аккаунт не подключён к тренеру');
    return link;
  }

  typed.get(
    '/api/client/workouts',
    { preHandler: requireClient, schema: { response: { 200: workoutListResponseSchema } } },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      const all = await svc.list(trainerId, clientId);
      const ts = (iso: string | null): number => (iso ? new Date(iso).getTime() : 0);
      const workouts = all
        .filter((w) => w.status === 'completed')
        .sort((a, b) => ts(b.completedAt) - ts(a.completedAt));
      return { workouts };
    },
  );

  typed.get(
    '/api/client/workouts/:wid',
    { preHandler: requireClient, schema: { params: widParams, response: { 200: workoutWrap } } },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      const workout = await svc.get(trainerId, clientId, req.params.wid);
      if (workout.status !== 'completed') throw notFound('Тренировка не найдена');
      return { workout };
    },
  );
}
