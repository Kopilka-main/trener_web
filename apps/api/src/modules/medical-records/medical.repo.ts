import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { files, medicalRecords } from '../../db/schema.js';

// Метаданные привязанного файла (или null — файл опционален).
export type MedicalFile = {
  id: string;
  mime: string;
  sizeBytes: number;
  originalName: string | null;
  createdAt: Date;
};

// Строка медзаписи вместе с метаданными файла (leftJoin files → file nullable).
export type MedicalRow = {
  id: string;
  trainerId: string;
  clientId: string;
  date: string;
  note: string;
  createdAt: Date;
  file: MedicalFile | null;
};

export type CreateMedicalInput = {
  id: string;
  trainerId: string;
  clientId: string;
  date: string;
  note: string;
  fileId: string | null;
};

export type UpdateMedicalInput = {
  date?: string | undefined;
  note?: string | undefined;
};

const columns = {
  id: medicalRecords.id,
  trainerId: medicalRecords.trainerId,
  clientId: medicalRecords.clientId,
  date: medicalRecords.date,
  note: medicalRecords.note,
  createdAt: medicalRecords.createdAt,
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
  note: string;
  createdAt: Date;
  fileId: string | null;
  fileMime: string | null;
  fileSizeBytes: number | null;
  fileOriginalName: string | null;
  fileCreatedAt: Date | null;
};

function toRow(r: JoinedRow): MedicalRow {
  // leftJoin: если файла нет (fileId IS NULL), file-колонки тоже NULL → file: null.
  const file: MedicalFile | null =
    r.fileId !== null && r.fileMime !== null && r.fileSizeBytes !== null && r.fileCreatedAt !== null
      ? {
          id: r.fileId,
          mime: r.fileMime,
          sizeBytes: r.fileSizeBytes,
          originalName: r.fileOriginalName,
          createdAt: r.fileCreatedAt,
        }
      : null;
  return {
    id: r.id,
    trainerId: r.trainerId,
    clientId: r.clientId,
    date: r.date,
    note: r.note,
    createdAt: r.createdAt,
    file,
  };
}

// Репозиторий медкарты: scoped по паре (тренер, клиент). HTTP-слой не импортирует.
export function makeMedicalRepo(db: Db) {
  function scope(trainerId: string, clientId: string, recordId: string) {
    return and(
      eq(medicalRecords.id, recordId),
      eq(medicalRecords.trainerId, trainerId),
      eq(medicalRecords.clientId, clientId),
    );
  }

  return {
    async create(input: CreateMedicalInput): Promise<MedicalRow> {
      await db.insert(medicalRecords).values({
        id: input.id,
        trainerId: input.trainerId,
        clientId: input.clientId,
        date: input.date,
        note: input.note,
        fileId: input.fileId,
      });
      // Перечитываем через leftJoin, чтобы вернуть file-метаданные единообразно.
      const row = await this.getForTrainer(input.trainerId, input.clientId, input.id);
      // create только что вставил строку — она гарантированно есть.
      return row!;
    },

    // Записи пары, отсортированные по дате (новые сверху); file nullable (leftJoin).
    async listForClient(trainerId: string, clientId: string): Promise<MedicalRow[]> {
      const rows = await db
        .select(columns)
        .from(medicalRecords)
        .leftJoin(files, eq(medicalRecords.fileId, files.id))
        .where(and(eq(medicalRecords.trainerId, trainerId), eq(medicalRecords.clientId, clientId)))
        .orderBy(desc(medicalRecords.date));
      return rows.map(toRow);
    },

    // Запись в scope пары вместе с file-метаданными (file nullable), либо null.
    async getForTrainer(
      trainerId: string,
      clientId: string,
      recordId: string,
    ): Promise<MedicalRow | null> {
      const [row] = await db
        .select(columns)
        .from(medicalRecords)
        .leftJoin(files, eq(medicalRecords.fileId, files.id))
        .where(scope(trainerId, clientId, recordId));
      return row ? toRow(row) : null;
    },

    // Обновляет date/note в scope пары; возвращает обновлённую строку либо null.
    async update(
      trainerId: string,
      clientId: string,
      recordId: string,
      patch: UpdateMedicalInput,
    ): Promise<MedicalRow | null> {
      const values: Partial<{ date: string; note: string }> = {};
      if (patch.date !== undefined) values.date = patch.date;
      if (patch.note !== undefined) values.note = patch.note;
      if (Object.keys(values).length > 0) {
        const [updated] = await db
          .update(medicalRecords)
          .set(values)
          .where(scope(trainerId, clientId, recordId))
          .returning({ id: medicalRecords.id });
        if (!updated) return null;
      }
      return this.getForTrainer(trainerId, clientId, recordId);
    },

    // Удаляет запись в scope пары; если был привязан файл — удаляет и строку files,
    // возвращая её storagePath (для чистки диска вызывающим). null если запись не найдена.
    // { storagePath: null } если запись была без файла.
    async remove(
      trainerId: string,
      clientId: string,
      recordId: string,
    ): Promise<{ storagePath: string | null } | null> {
      const [deleted] = await db
        .delete(medicalRecords)
        .where(scope(trainerId, clientId, recordId))
        .returning({ fileId: medicalRecords.fileId });
      if (!deleted) return null;
      if (deleted.fileId === null) return { storagePath: null };
      const [deletedFile] = await db
        .delete(files)
        .where(and(eq(files.id, deleted.fileId), eq(files.trainerId, trainerId)))
        .returning({ storagePath: files.storagePath });
      return { storagePath: deletedFile ? deletedFile.storagePath : null };
    },
  };
}

export type MedicalRepo = ReturnType<typeof makeMedicalRepo>;
