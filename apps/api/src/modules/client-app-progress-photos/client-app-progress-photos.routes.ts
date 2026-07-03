import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { angleSchema, photoResponseSchema, photoListResponseSchema } from '@trener/shared';
import type {
  ProgressPhotosService,
  UploadInput,
} from '../progress-photos/progress-photos.service.js';
import type { Storage } from '../../files/storage.js';
import { requireClient } from '../../plugins/client-context.js';
import { makeClientScope, type ResolveScope } from '../../core/client-scope.js';
import { AppError, notFound } from '../../errors.js';

// Порт раздачи файла в scope пары (тренер, клиент) — без импорта repo/db в HTTP-слое.
export type ClientFileReadPort = {
  getForClient(
    trainerId: string,
    clientId: string,
    id: string,
  ): Promise<{ mime: string; storagePath: string } | null>;
};

const pidParams = z.object({ pid: z.string().min(1) });
const fileParams = z.object({ id: z.string().min(1) });
const photoWrap = z.object({ photo: photoResponseSchema });

// Поля multipart валидируем вручную (приходят строками в частях формы).
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const noteSchema = z.string().trim().max(2000);

// Структурно совпадает с push PushPayload (HTTP-слой не импортирует push-модуль).
type TrainerPushPayload = { title: string; body: string; url?: string };

// HTTP-слой progress-photos (клиентское приложение): /api/client/progress-photos*.
// Клиент НЕ выбирает scope сам — он приходит из resolveScope (clients.accountId + связь).
export function clientAppProgressPhotosRoutes(
  app: FastifyInstance,
  svc: ProgressPhotosService,
  filePort: ClientFileReadPort,
  storage: Storage,
  resolveScope: ResolveScope,
  // Пуш ТРЕНЕРУ при добавлении фото клиентом (fire-and-forget, опционален).
  notifyTrainer?: (
    trainerId: string,
    clientId: string,
    build: (clientName: string) => TrainerPushPayload,
  ) => void,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const scope = makeClientScope(resolveScope);

  async function readMultipart(req: FastifyRequest): Promise<UploadInput> {
    let fileBuffer: Buffer | null = null;
    let mime: string | null = null;
    let originalName: string | null = null;
    const fields: Record<string, string> = {};

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        if (part.fieldname === 'photo') {
          fileBuffer = await part.toBuffer();
          mime = part.mimetype;
          originalName = part.filename || null;
        } else {
          await part.toBuffer();
        }
      } else if (typeof part.value === 'string') {
        fields[part.fieldname] = part.value;
      }
    }

    if (!fileBuffer || mime === null) {
      throw new AppError(400, 'FILE_REQUIRED', 'Файл `photo` обязателен');
    }

    const angle = angleSchema.safeParse(fields.angle);
    if (!angle.success) throw new AppError(400, 'VALIDATION', 'Некорректный ракурс (angle)');
    const date = dateSchema.safeParse(fields.date);
    if (!date.success) throw new AppError(400, 'VALIDATION', 'Некорректная дата (date)');

    let note: string | null = null;
    if (fields.note !== undefined && fields.note !== '') {
      const parsed = noteSchema.safeParse(fields.note);
      if (!parsed.success) throw new AppError(400, 'VALIDATION', 'Некорректная заметка (note)');
      note = parsed.data;
    }

    return { fileBuffer, mime, originalName, date: date.data, angle: angle.data, note };
  }

  typed.post(
    '/api/client/progress-photos',
    { preHandler: requireClient, schema: { response: { 201: photoWrap } } },
    async (req, reply) => {
      const { trainerId, clientId } = await scope(req);
      const input = await readMultipart(req);
      const photo = await svc.upload(trainerId, clientId, input);
      // Уведомить тренера: клиент добавил фото прогресса. Fire-and-forget.
      if (notifyTrainer) {
        notifyTrainer(trainerId, clientId, (clientName) => ({
          title: clientName,
          body: 'Добавил фото прогресса',
          url: `/clients/${clientId}`,
        }));
      }
      void reply.status(201);
      return { photo };
    },
  );

  typed.get(
    '/api/client/progress-photos',
    { preHandler: requireClient, schema: { response: { 200: photoListResponseSchema } } },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      return { photos: await svc.list(trainerId, clientId) };
    },
  );

  typed.delete(
    '/api/client/progress-photos/:pid',
    {
      preHandler: requireClient,
      schema: { params: pidParams, response: { 200: z.object({ ok: z.literal(true) }) } },
    },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      await svc.remove(trainerId, clientId, req.params.pid);
      return { ok: true as const };
    },
  );

  // Защищённая раздача файла фото клиенту (scoped по паре). Тело — бинарь, без zod-схемы.
  typed.get(
    '/api/client/files/:id',
    { preHandler: requireClient, schema: { params: fileParams } },
    async (req, reply) => {
      const { trainerId, clientId } = await scope(req);
      const row = await filePort.getForClient(trainerId, clientId, req.params.id);
      if (!row) throw notFound('Файл не найден');
      reply.header('Content-Type', row.mime);
      return reply.send(storage.openRead(row.storagePath));
    },
  );
}
