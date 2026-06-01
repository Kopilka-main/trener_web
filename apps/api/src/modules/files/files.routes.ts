import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Storage } from '../../files/storage.js';
import { requireAuth } from '../../plugins/tenant-context.js';
import { notFound, unauthorized } from '../../errors.js';

// Порт для раздачи: HTTP-слой не импортирует repo/db (граница слоёв *.routes ↔ *.repo).
// Модуль (files.module.ts) передаёт files-repo, структурно совместимый с этим типом.
export type FileReadPort = {
  getForTrainer(
    trainerId: string,
    id: string,
  ): Promise<{ mime: string; storagePath: string } | null>;
};

const fileParams = z.object({ id: z.string() });

// HTTP-слой files: защищённая раздача GET /api/files/:id (НЕ static).
// requireAuth → файл резолвится в scope тренера (404 чужому/несуществующему) →
// стрим с диска. Тело — бинарь, потому без zod response-схемы на этом роуте.
// Сборка repo/storage — в files.module.ts (граница слоёв; routes не импортирует db).
export function filesRoutes(app: FastifyInstance, repo: FileReadPort, storage: Storage): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  function trainerId(req: { trainerId?: string }): string {
    if (!req.trainerId) throw unauthorized('Требуется вход');
    return req.trainerId;
  }

  typed.get(
    '/api/files/:id',
    { preHandler: [requireAuth], schema: { params: fileParams } },
    async (req, reply) => {
      const row = await repo.getForTrainer(trainerId(req), req.params.id);
      if (!row) throw notFound('Файл не найден');
      reply.header('Content-Type', row.mime);
      return reply.send(storage.openRead(row.storagePath));
    },
  );
}
