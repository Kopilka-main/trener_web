import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { trainers, sessionsAuth } from '../../db/schema.js';

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
