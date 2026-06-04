import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { files } from '../../db/schema.js';

export type FileRow = {
  id: string;
  trainerId: string | null;
  clientId: string | null;
  accountId: string | null;
  mime: string;
  sizeBytes: number;
  storagePath: string;
  originalName: string | null;
  createdAt: Date;
};

export type CreateFileInput = {
  id: string;
  trainerId: string | null;
  clientId: string | null;
  accountId: string | null;
  mime: string;
  sizeBytes: number;
  storagePath: string;
  originalName: string | null;
};

const columns = {
  id: files.id,
  trainerId: files.trainerId,
  clientId: files.clientId,
  accountId: files.accountId,
  mime: files.mime,
  sizeBytes: files.sizeBytes,
  storagePath: files.storagePath,
  originalName: files.originalName,
  createdAt: files.createdAt,
};

// Репозиторий файлов. Файл принадлежит либо тренеру (trainerId), либо клиент-аккаунту
// (accountId) — инвариант XOR обеспечивается сервисным слоем.
export function makeFilesRepo(db: Db) {
  return {
    async create(input: CreateFileInput): Promise<FileRow> {
      const [row] = await db
        .insert(files)
        .values({
          id: input.id,
          trainerId: input.trainerId,
          clientId: input.clientId,
          accountId: input.accountId,
          mime: input.mime,
          sizeBytes: input.sizeBytes,
          storagePath: input.storagePath,
          originalName: input.originalName,
        })
        .returning(columns);
      // returning по PK всегда возвращает строку.
      return row!;
    },

    // Файл в scope тренера, либо null (нет/чужой).
    async getForTrainer(trainerId: string, id: string): Promise<FileRow | null> {
      const [row] = await db
        .select(columns)
        .from(files)
        .where(and(eq(files.id, id), eq(files.trainerId, trainerId)));
      return row ?? null;
    },

    // Файл в scope клиент-аккаунта, либо null (нет/чужой).
    async getForAccount(accountId: string, id: string): Promise<FileRow | null> {
      const [row] = await db
        .select(columns)
        .from(files)
        .where(and(eq(files.id, id), eq(files.accountId, accountId)));
      return row ?? null;
    },

    // Файл по id без проверки владельца (владение проверяет вызывающий по avatarFileId).
    async getById(id: string): Promise<FileRow | null> {
      const [row] = await db.select(columns).from(files).where(eq(files.id, id));
      return row ?? null;
    },

    // Удаляет файл по id без проверки владельца и возвращает удалённую строку (или null).
    async deleteById(id: string): Promise<FileRow | null> {
      const [row] = await db.delete(files).where(eq(files.id, id)).returning(columns);
      return row ?? null;
    },

    // Удаляет файл в scope тренера и возвращает удалённую строку (для чистки диска
    // вызывающим), либо null если не найдено/чужой.
    async delete(trainerId: string, id: string): Promise<FileRow | null> {
      const [row] = await db
        .delete(files)
        .where(and(eq(files.id, id), eq(files.trainerId, trainerId)))
        .returning(columns);
      return row ?? null;
    },
  };
}

export type FilesRepo = ReturnType<typeof makeFilesRepo>;
