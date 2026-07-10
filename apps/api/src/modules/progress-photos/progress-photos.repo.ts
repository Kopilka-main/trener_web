import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { files, progressPhotos } from '../../db/schema.js';
import type { Angle } from '@trener/shared';

// Строка фото вместе с метаданными привязанного файла (join files).
export type PhotoRow = {
  id: string;
  trainerId: string;
  clientId: string;
  date: string;
  angle: Angle;
  note: string | null;
  createdByClient: boolean;
  createdAt: Date;
  file: {
    id: string;
    mime: string;
    sizeBytes: number;
    originalName: string | null;
    createdAt: Date;
  };
};

export type CreatePhotoInput = {
  id: string;
  trainerId: string;
  clientId: string;
  date: string;
  angle: Angle;
  fileId: string;
  note: string | null;
  createdByClient: boolean;
};

const columns = {
  id: progressPhotos.id,
  trainerId: progressPhotos.trainerId,
  clientId: progressPhotos.clientId,
  date: progressPhotos.date,
  angle: progressPhotos.angle,
  note: progressPhotos.note,
  createdByClient: progressPhotos.createdByClient,
  createdAt: progressPhotos.createdAt,
  fileId: files.id,
  fileMime: files.mime,
  fileSizeBytes: files.sizeBytes,
  fileOriginalName: files.originalName,
  fileCreatedAt: files.createdAt,
};

type JoinedRow = {
  id: string;
  trainerId: string;
  clientId: string;
  date: string;
  angle: Angle;
  note: string | null;
  createdByClient: boolean;
  createdAt: Date;
  fileId: string;
  fileMime: string;
  fileSizeBytes: number;
  fileOriginalName: string | null;
  fileCreatedAt: Date;
};

function toRow(r: JoinedRow): PhotoRow {
  return {
    id: r.id,
    trainerId: r.trainerId,
    clientId: r.clientId,
    date: r.date,
    angle: r.angle,
    note: r.note,
    createdByClient: r.createdByClient,
    createdAt: r.createdAt,
    file: {
      id: r.fileId,
      mime: r.fileMime,
      sizeBytes: r.fileSizeBytes,
      originalName: r.fileOriginalName,
      createdAt: r.fileCreatedAt,
    },
  };
}

// Репозиторий фото прогресса: scoped по паре (тренер, клиент). HTTP-слой не импортирует.
export function makeProgressPhotosRepo(db: Db) {
  function scope(trainerId: string, clientId: string, photoId: string) {
    return and(
      eq(progressPhotos.id, photoId),
      eq(progressPhotos.trainerId, trainerId),
      eq(progressPhotos.clientId, clientId),
    );
  }

  return {
    async create(input: CreatePhotoInput): Promise<PhotoRow> {
      await db.insert(progressPhotos).values({
        id: input.id,
        trainerId: input.trainerId,
        clientId: input.clientId,
        date: input.date,
        angle: input.angle,
        fileId: input.fileId,
        note: input.note,
        createdByClient: input.createdByClient,
      });
      // Перечитываем через join, чтобы вернуть file-метаданные единообразно.
      const row = await this.getForTrainer(input.trainerId, input.clientId, input.id);
      // create только что вставил строку — она гарантированно есть.
      return row!;
    },

    // Фото пары, отсортированные по дате (новые сверху); каждое с file-метаданными.
    async listForClient(trainerId: string, clientId: string): Promise<PhotoRow[]> {
      const rows = await db
        .select(columns)
        .from(progressPhotos)
        .innerJoin(files, eq(progressPhotos.fileId, files.id))
        .where(and(eq(progressPhotos.trainerId, trainerId), eq(progressPhotos.clientId, clientId)))
        .orderBy(desc(progressPhotos.date));
      return rows.map(toRow);
    },

    // Фото в scope пары вместе с file-метаданными, либо null (нет в паре).
    async getForTrainer(
      trainerId: string,
      clientId: string,
      photoId: string,
    ): Promise<PhotoRow | null> {
      const [row] = await db
        .select(columns)
        .from(progressPhotos)
        .innerJoin(files, eq(progressPhotos.fileId, files.id))
        .where(scope(trainerId, clientId, photoId));
      return row ? toRow(row) : null;
    },

    // Удаляет фото в scope пары и возвращает storagePath привязанного файла
    // (для чистки диска вызывающим), либо null если не найдено/чужой.
    // Запись files удаляется каскадом самим вызывающим через filesRepo? Нет —
    // удаляем строку файла здесь же (FK cascade удалит progress_photos при удалении
    // file, но мы идём от фото). Возвращаем storagePath удалённого файла.
    async remove(
      trainerId: string,
      clientId: string,
      photoId: string,
    ): Promise<{ storagePath: string } | null> {
      const [photo] = await db
        .select({ fileId: progressPhotos.fileId })
        .from(progressPhotos)
        .where(scope(trainerId, clientId, photoId));
      if (!photo) return null;
      // Удаляем строку файла → progress_photos уходит каскадом (FK file_id cascade).
      const [deletedFile] = await db
        .delete(files)
        .where(and(eq(files.id, photo.fileId), eq(files.trainerId, trainerId)))
        .returning({ storagePath: files.storagePath });
      return deletedFile ? { storagePath: deletedFile.storagePath } : null;
    },
  };
}

export type ProgressPhotosRepo = ReturnType<typeof makeProgressPhotosRepo>;
