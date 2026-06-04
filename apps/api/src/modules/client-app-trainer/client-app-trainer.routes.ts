import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { trainerPublicResponseSchema, type TrainerPublicResponse } from '@trener/shared';
import type { Storage } from '../../files/storage.js';
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
  findAvatarFileId: (trainerId: string) => Promise<string | null>;
};

// Порт раздачи файла по id (HTTP-слой не импортирует repo/db — граница слоёв).
export type FileByIdPort = {
  getById(id: string): Promise<{ mime: string; storagePath: string } | null>;
};

const trainerWrap = z.object({ trainer: trainerPublicResponseSchema });

export function clientAppTrainerRoutes(
  app: FastifyInstance,
  lookup: TrainerLookup,
  files: FileByIdPort,
  storage: Storage,
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

  // Раздача аватара тренера клиенту: scope (401 без сессии / 409 без привязки) →
  // trainers.avatarFileId → файл → стрим. Нет фото → 404. Тело бинарь — без zod.
  typed.get('/api/client/trainer/avatar', { preHandler: requireClient }, async (req, reply) => {
    const { trainerId } = await scope(req);
    const fileId = await lookup.findAvatarFileId(trainerId);
    if (!fileId) throw notFound('Аватар не найден');
    const row = await files.getById(fileId);
    if (!row) throw notFound('Аватар не найден');
    reply.header('Content-Type', row.mime);
    return reply.send(storage.openRead(row.storagePath));
  });
}
