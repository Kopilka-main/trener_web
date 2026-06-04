import type { MedicalRepo, MedicalRow } from './medical.repo.js';
import type { FilesRepo } from '../files/files.repo.js';
import type { Storage } from '../../files/storage.js';
import type { MedicalRecordResponse, UpdateMedicalRecordRequest } from '@trener/shared';
import { AppError, notFound } from '../../errors.js';

export type MedicalServiceDeps = { newId: () => string };

// Расширение файла выводим ИЗ MIME по whitelist (НЕ из имени клиента). Для медкарты
// допустимы изображения и PDF.
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

// Опциональный файл записи (буфер + метаданные).
export type MedicalFileInput = {
  buffer: Buffer;
  mime: string;
  originalName: string | null;
};

export type CreateMedicalInput = {
  date: string;
  note: string;
  file?: MedicalFileInput;
};

function toResponse(r: MedicalRow): MedicalRecordResponse {
  return {
    id: r.id,
    clientId: r.clientId,
    date: r.date,
    note: r.note,
    file: r.file
      ? {
          id: r.file.id,
          mime: r.file.mime,
          sizeBytes: r.file.sizeBytes,
          originalName: r.file.originalName,
          createdAt: r.file.createdAt.toISOString(),
        }
      : null,
    createdAt: r.createdAt.toISOString(),
  };
}

export function makeMedicalService(
  repo: MedicalRepo,
  filesRepo: FilesRepo,
  storage: Storage,
  deps: MedicalServiceDeps,
) {
  return {
    // Файл опционален. Если есть: whitelist mime → storage.save → filesRepo.create.
    // Затем repo.create. Не в транзакции (storage пишет вне БД); при падении БД-вставки
    // после записи на диск — чистим файл best-effort, чтобы не оставить сирот.
    async create(
      trainerId: string,
      clientId: string,
      input: CreateMedicalInput,
    ): Promise<MedicalRecordResponse> {
      let fileId: string | null = null;
      let savedPath: string | null = null;

      if (input.file) {
        const ext = MIME_EXT[input.file.mime];
        if (!ext) {
          throw new AppError(400, 'UNSUPPORTED_MEDIA_TYPE', 'Неподдерживаемый тип файла');
        }
        fileId = deps.newId();
        const saved = await storage.save(trainerId, clientId, fileId, ext, input.file.buffer);
        savedPath = saved.storagePath;
        try {
          await filesRepo.create({
            id: fileId,
            trainerId,
            clientId,
            accountId: null,
            mime: input.file.mime,
            sizeBytes: saved.sizeBytes,
            storagePath: saved.storagePath,
            originalName: input.file.originalName,
          });
        } catch (err) {
          await storage.remove(saved.storagePath).catch(() => undefined);
          throw err;
        }
      }

      try {
        const row = await repo.create({
          id: deps.newId(),
          trainerId,
          clientId,
          date: input.date,
          note: input.note,
          fileId,
        });
        return toResponse(row);
      } catch (err) {
        // Откат файла, если он был сохранён до падения вставки медзаписи.
        if (savedPath) await storage.remove(savedPath).catch(() => undefined);
        throw err;
      }
    },

    async list(trainerId: string, clientId: string): Promise<MedicalRecordResponse[]> {
      const rows = await repo.listForClient(trainerId, clientId);
      return rows.map(toResponse);
    },

    async get(
      trainerId: string,
      clientId: string,
      recordId: string,
    ): Promise<MedicalRecordResponse> {
      const row = await repo.getForTrainer(trainerId, clientId, recordId);
      if (!row) throw notFound('Запись медкарты не найдена');
      return toResponse(row);
    },

    // Обновляет date/note. 404 если записи нет в scope пары.
    async update(
      trainerId: string,
      clientId: string,
      recordId: string,
      patch: UpdateMedicalRecordRequest,
    ): Promise<MedicalRecordResponse> {
      const row = await repo.update(trainerId, clientId, recordId, patch);
      if (!row) throw notFound('Запись медкарты не найдена');
      return toResponse(row);
    },

    // Удаляет запись; если был файл — чистит его с диска. 404 если записи нет.
    async remove(trainerId: string, clientId: string, recordId: string): Promise<void> {
      const removed = await repo.remove(trainerId, clientId, recordId);
      if (!removed) throw notFound('Запись медкарты не найдена');
      if (removed.storagePath) await storage.remove(removed.storagePath);
    },
  };
}

export type MedicalService = ReturnType<typeof makeMedicalService>;
