import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { angleSchema, photoResponseSchema, photoListResponseSchema } from '@trener/shared';
import type { ProgressPhotosService, UploadInput } from './progress-photos.service.js';
import { requireAuth } from '../../plugins/tenant-context.js';
import type { makeRequireClientAccess } from '../../plugins/require-client-access.js';
import { AppError, unauthorized } from '../../errors.js';

// guard связи тренер↔клиент — тип из плагина (не repo/db), граница слоёв.
type RequireClientAccess = ReturnType<typeof makeRequireClientAccess>;

const clientParams = z.object({ id: z.string() });
const photoParams = z.object({ id: z.string(), pid: z.string() });
const photoWrap = z.object({ photo: photoResponseSchema });

// Поля multipart валидируем вручную (поля приходят строками в частях формы).
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const noteSchema = z.string().trim().max(2000);

// HTTP-слой progress-photos: вложен под клиента (/api/clients/:id/progress-photos...).
// POST — multipart (файл `photo` + поля angle/date/note). Сборка repo/service/guard —
// в progress-photos.module.ts (граница слоёв; routes не импортирует db/storage).
export function progressPhotosRoutes(
  app: FastifyInstance,
  svc: ProgressPhotosService,
  requireClientAccess: RequireClientAccess,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const preHandler = [requireAuth, requireClientAccess];

  function trainerId(req: { trainerId?: string }): string {
    if (!req.trainerId) throw unauthorized('Требуется вход');
    return req.trainerId;
  }

  // Читает multipart-запрос: собирает файл `photo` в буфер и текстовые поля.
  async function readMultipart(req: FastifyRequest): Promise<UploadInput> {
    let fileBuffer: Buffer | null = null;
    let mime: string | null = null;
    let originalName: string | null = null;
    const fields: Record<string, string> = {};

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        if (part.fieldname === 'photo') {
          // Буфер собираем немедленно (поток части нужно прочитать до перехода далее).
          fileBuffer = await part.toBuffer();
          mime = part.mimetype;
          originalName = part.filename || null;
        } else {
          // Прочие файловые части дренируем, чтобы не блокировать поток.
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
    '/api/clients/:id/progress-photos',
    { preHandler, schema: { params: clientParams, response: { 201: photoWrap } } },
    async (req, reply) => {
      const input = await readMultipart(req);
      const photo = await svc.upload(trainerId(req), req.params.id, input);
      void reply.status(201);
      return { photo };
    },
  );

  typed.get(
    '/api/clients/:id/progress-photos',
    { preHandler, schema: { params: clientParams, response: { 200: photoListResponseSchema } } },
    async (req) => ({ photos: await svc.list(trainerId(req), req.params.id) }),
  );

  typed.get(
    '/api/clients/:id/progress-photos/:pid',
    { preHandler, schema: { params: photoParams, response: { 200: photoWrap } } },
    async (req) => ({ photo: await svc.get(trainerId(req), req.params.id, req.params.pid) }),
  );

  typed.delete(
    '/api/clients/:id/progress-photos/:pid',
    {
      preHandler,
      schema: { params: photoParams, response: { 200: z.object({ ok: z.literal(true) }) } },
    },
    async (req) => {
      await svc.remove(trainerId(req), req.params.id, req.params.pid);
      return { ok: true as const };
    },
  );
}
