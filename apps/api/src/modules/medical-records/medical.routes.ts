import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  medicalRecordResponseSchema,
  medicalRecordListResponseSchema,
  updateMedicalRecordRequestSchema,
} from '@trener/shared';
import type { MedicalService, CreateMedicalInput } from './medical.service.js';
import { requireAuth } from '../../plugins/tenant-context.js';
import type { makeRequireClientAccess } from '../../plugins/require-client-access.js';
import { AppError, unauthorized } from '../../errors.js';

// guard связи тренер↔клиент — тип из плагина (не repo/db), граница слоёв.
type RequireClientAccess = ReturnType<typeof makeRequireClientAccess>;

const clientParams = z.object({ id: z.string() });
const recordParams = z.object({ id: z.string(), mid: z.string() });
const recordWrap = z.object({ record: medicalRecordResponseSchema });

// Поля multipart валидируем вручную (поля приходят строками в частях формы).
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const noteSchema = z.string().trim().min(1).max(4000);

// HTTP-слой medical-records: вложен под клиента (/api/clients/:id/medical...).
// POST — multipart (опц. файл `file` + поля date/note). PATCH — JSON body (не multipart).
// Сборка repo/service/guard — в medical.module.ts (границы слоёв; routes не импортирует db/storage).
export function medicalRoutes(
  app: FastifyInstance,
  svc: MedicalService,
  requireClientAccess: RequireClientAccess,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const preHandler = [requireAuth, requireClientAccess];

  function trainerId(req: { trainerId?: string }): string {
    if (!req.trainerId) throw unauthorized('Требуется вход');
    return req.trainerId;
  }

  // Читает multipart-запрос: опционально собирает файл `file` в буфер + поля date/note.
  async function readMultipart(req: FastifyRequest): Promise<CreateMedicalInput> {
    let fileBuffer: Buffer | null = null;
    let mime: string | null = null;
    let originalName: string | null = null;
    const fields: Record<string, string> = {};

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        if (part.fieldname === 'file' && fileBuffer === null) {
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

    const date = dateSchema.safeParse(fields.date);
    if (!date.success) throw new AppError(400, 'VALIDATION', 'Некорректная дата (date)');
    const note = noteSchema.safeParse(fields.note);
    if (!note.success) throw new AppError(400, 'VALIDATION', 'Некорректная заметка (note)');

    const input: CreateMedicalInput = { date: date.data, note: note.data };
    if (fileBuffer !== null && mime !== null) {
      input.file = { buffer: fileBuffer, mime, originalName };
    }
    return input;
  }

  typed.post(
    '/api/clients/:id/medical',
    { preHandler, schema: { params: clientParams, response: { 201: recordWrap } } },
    async (req, reply) => {
      const input = await readMultipart(req);
      const record = await svc.create(trainerId(req), req.params.id, input);
      void reply.status(201);
      return { record };
    },
  );

  typed.get(
    '/api/clients/:id/medical',
    {
      preHandler,
      schema: { params: clientParams, response: { 200: medicalRecordListResponseSchema } },
    },
    async (req) => ({ records: await svc.list(trainerId(req), req.params.id) }),
  );

  typed.get(
    '/api/clients/:id/medical/:mid',
    { preHandler, schema: { params: recordParams, response: { 200: recordWrap } } },
    async (req) => ({ record: await svc.get(trainerId(req), req.params.id, req.params.mid) }),
  );

  typed.patch(
    '/api/clients/:id/medical/:mid',
    {
      preHandler,
      schema: {
        params: recordParams,
        body: updateMedicalRecordRequestSchema,
        response: { 200: recordWrap },
      },
    },
    async (req) => ({
      record: await svc.update(trainerId(req), req.params.id, req.params.mid, req.body),
    }),
  );

  typed.delete(
    '/api/clients/:id/medical/:mid',
    {
      preHandler,
      schema: { params: recordParams, response: { 200: z.object({ ok: z.literal(true) }) } },
    },
    async (req) => {
      await svc.remove(trainerId(req), req.params.id, req.params.mid);
      return { ok: true as const };
    },
  );
}
