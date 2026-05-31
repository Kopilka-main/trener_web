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
