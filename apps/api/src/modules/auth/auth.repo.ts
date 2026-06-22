import { and, eq, isNotNull, lte } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { trainers, sessionsAuth, files } from '../../db/schema.js';

export type NewTrainer = {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
};

export function makeAuthRepo(db: Db) {
  return {
    async createTrainer(t: NewTrainer) {
      const [row] = await db.insert(trainers).values(t).returning();
      return row;
    },
    async findTrainerByEmail(email: string) {
      const [row] = await db.select().from(trainers).where(eq(trainers.email, email));
      return row ?? null;
    },
    async findTrainerById(id: string) {
      const [row] = await db.select().from(trainers).where(eq(trainers.id, id));
      return row ?? null;
    },
    async updateTrainer(
      id: string,
      patch: {
        firstName?: string;
        lastName?: string;
        title?: string | null;
        bio?: string | null;
        birthDate?: string | null;
        contacts?: { type: string; value: string }[];
      },
    ) {
      if (Object.keys(patch).length === 0) {
        const [row] = await db.select().from(trainers).where(eq(trainers.id, id));
        return row ?? null;
      }
      const [row] = await db.update(trainers).set(patch).where(eq(trainers.id, id)).returning();
      return row ?? null;
    },
    // Проставляет/снимает аватар тренера, возвращает прежний avatarFileId (для чистки).
    // null fileId — снять аватар. null-результат — тренер не найден.
    async setAvatar(
      trainerId: string,
      fileId: string | null,
    ): Promise<{ previousFileId: string | null } | null> {
      const [prev] = await db
        .select({ avatarFileId: trainers.avatarFileId })
        .from(trainers)
        .where(eq(trainers.id, trainerId));
      if (!prev) return null;
      await db.update(trainers).set({ avatarFileId: fileId }).where(eq(trainers.id, trainerId));
      return { previousFileId: prev.avatarFileId };
    },

    // avatarFileId тренера (для раздачи фото клиенту), либо null если тренер не найден.
    async findAvatarFileId(trainerId: string): Promise<string | null> {
      const [row] = await db
        .select({ avatarFileId: trainers.avatarFileId })
        .from(trainers)
        .where(eq(trainers.id, trainerId));
      return row?.avatarFileId ?? null;
    },

    // ─── Удаление аккаунта с окном отмены ───

    // Запланировать/отменить удаление: at=Date — удалить в этот момент; null — отмена.
    async setPendingDeletion(id: string, at: Date | null): Promise<void> {
      await db.update(trainers).set({ pendingDeletionAt: at }).where(eq(trainers.id, id));
    },

    // Тренеры, у которых окно отмены истекло (pending_deletion_at ≤ now) — на снос.
    async findExpiredDeletions(now: Date): Promise<{ id: string }[]> {
      return db
        .select({ id: trainers.id })
        .from(trainers)
        .where(and(isNotNull(trainers.pendingDeletionAt), lte(trainers.pendingDeletionAt, now)));
    },

    // Пути файлов тренера на диске — читаем ДО удаления (строки files уйдут каскадом).
    async findTrainerFileStoragePaths(trainerId: string): Promise<string[]> {
      const rows = await db
        .select({ storagePath: files.storagePath })
        .from(files)
        .where(eq(files.trainerId, trainerId));
      return rows.map((r) => r.storagePath);
    },

    // Жёсткое удаление тренера: каскадом сносит весь воркспейс (упражнения, шаблоны,
    // тренировки, занятия, чат, залы, замеры, фото, файлы, push, сессии).
    async deleteTrainer(id: string): Promise<void> {
      await db.delete(trainers).where(eq(trainers.id, id));
    },

    async createSession(s: { id: string; trainerId: string; expiresAt: Date }) {
      await db.insert(sessionsAuth).values(s);
    },
    async findSession(id: string) {
      const [row] = await db.select().from(sessionsAuth).where(eq(sessionsAuth.id, id));
      return row ?? null;
    },
    async deleteSession(id: string) {
      await db.delete(sessionsAuth).where(eq(sessionsAuth.id, id));
    },
  };
}

export type AuthRepo = ReturnType<typeof makeAuthRepo>;
