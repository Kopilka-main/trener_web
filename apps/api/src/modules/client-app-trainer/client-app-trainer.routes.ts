import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { trainerPublicResponseSchema, type TrainerPublicResponse } from '@trener/shared';
import { requireClient } from '../../plugins/client-context.js';
import { makeClientScope, type ResolveScope } from '../../core/client-scope.js';
import { notFound } from '../../errors.js';

export type TrainerLookup = {
  findTrainerById: (id: string) => Promise<{
    id: string;
    firstName: string;
    lastName: string;
    title: string | null;
    bio: string | null;
    contacts: { type: string; value: string }[];
    avatarFileId?: string | null;
  } | null>;
};

const trainerWrap = z.object({ trainer: trainerPublicResponseSchema });

export function clientAppTrainerRoutes(
  app: FastifyInstance,
  lookup: TrainerLookup,
  resolveScope: ResolveScope,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const scope = makeClientScope(resolveScope);

  typed.get(
    '/api/client/trainer',
    { preHandler: requireClient, schema: { response: { 200: trainerWrap } } },
    async (req) => {
      const { trainerId } = await scope(req);
      const t = await lookup.findTrainerById(trainerId);
      if (!t) throw notFound('Тренер не найден');
      const trainer: TrainerPublicResponse = {
        id: t.id,
        firstName: t.firstName,
        lastName: t.lastName,
        title: t.title,
        bio: t.bio,
        contacts: t.contacts,
        avatarFileId: t.avatarFileId ?? null,
      };
      return { trainer };
    },
  );
}
