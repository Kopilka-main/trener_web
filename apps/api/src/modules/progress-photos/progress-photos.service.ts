import type { ProgressPhotosRepo, PhotoRow } from './progress-photos.repo.js';
import type { FilesRepo } from '../files/files.repo.js';
import type { Storage } from '../../files/storage.js';
import type { Angle, PhotoResponse } from '@trener/shared';
import { AppError, notFound } from '../../errors.js';

export type ProgressPhotosDeps = { newId: () => string };

// Расширение файла выводим ИЗ MIME по whitelist (НЕ из имени файла клиента).
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export type UploadInput = {
  fileBuffer: Buffer;
  mime: string;
  originalName: string | null;
  date: string;
  angle: Angle;
  note: string | null;
};

function toResponse(r: PhotoRow): PhotoResponse {
  return {
    id: r.id,
    clientId: r.clientId,
    date: r.date,
    angle: r.angle,
    note: r.note,
    file: {
      id: r.file.id,
      mime: r.file.mime,
      sizeBytes: r.file.sizeBytes,
      originalName: r.file.originalName,
      createdAt: r.file.createdAt.toISOString(),
    },
    createdAt: r.createdAt.toISOString(),
  };
}

export function makeProgressPhotosService(
  repo: ProgressPhotosRepo,
  filesRepo: FilesRepo,
  storage: Storage,
  deps: ProgressPhotosDeps,
) {
  return {
    // Порядок: проверка mime → storage.save (диск) → filesRepo.create → repo.create.
    // Не в транзакции (storage пишет вне БД). Если БД-вставка упадёт после записи на
    // диск — чистим файл best-effort, чтобы не оставить сирот.
    async upload(trainerId: string, clientId: string, input: UploadInput): Promise<PhotoResponse> {
      const ext = MIME_EXT[input.mime];
      if (!ext) {
        throw new AppError(400, 'UNSUPPORTED_MEDIA_TYPE', 'Неподдерживаемый тип файла');
      }

      const fileId = deps.newId();
      const saved = await storage.save(trainerId, clientId, fileId, ext, input.fileBuffer);

      try {
        await filesRepo.create({
          id: fileId,
          trainerId,
          clientId,
          mime: input.mime,
          sizeBytes: saved.sizeBytes,
          storagePath: saved.storagePath,
          originalName: input.originalName,
        });
        const row = await repo.create({
          id: deps.newId(),
          trainerId,
          clientId,
          date: input.date,
          angle: input.angle,
          fileId,
          note: input.note,
        });
        return toResponse(row);
      } catch (err) {
        // Откат: удаляем файл с диска (запись files уйдёт каскадом/её ещё нет).
        await storage.remove(saved.storagePath).catch(() => undefined);
        throw err;
      }
    },

    async list(trainerId: string, clientId: string): Promise<PhotoResponse[]> {
      const rows = await repo.listForClient(trainerId, clientId);
      return rows.map(toResponse);
    },

    async get(trainerId: string, clientId: string, photoId: string): Promise<PhotoResponse> {
      const row = await repo.getForTrainer(trainerId, clientId, photoId);
      if (!row) throw notFound('Фото не найдено');
      return toResponse(row);
    },

    // Удаляет запись (каскадом и файл-строку) и чистит файл с диска. 404 если нет.
    async remove(trainerId: string, clientId: string, photoId: string): Promise<void> {
      const removed = await repo.remove(trainerId, clientId, photoId);
      if (!removed) throw notFound('Фото не найдено');
      await storage.remove(removed.storagePath);
    },
  };
}

export type ProgressPhotosService = ReturnType<typeof makeProgressPhotosService>;
