import { and, eq, lt } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { oauthStates, oauthAccounts, trainers, clientAccounts } from '../../db/schema.js';
import { hashPassword } from '../../auth/password.js';
import type { OAuthProvider, OAuthApp } from './oauth.schema.js';

// Записи state старше этого возраста — мусор (флоу не завершён), чистим при saveState.
const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 минут

export type OAuthStateRow = {
  state: string;
  provider: string;
  app: OAuthApp;
  verifier: string | null;
};

export type OAuthAccountRow = {
  id: string;
  provider: string;
  providerUserId: string;
  trainerId: string | null;
  clientAccountId: string | null;
};

export type NewId = () => string;
export type Now = () => Date;

export function makeOAuthRepo(db: Db, newId: NewId, now: Now) {
  // OAuth-аккаунты создаются без пароля пользователя: ставим argon2-хэш от случайной
  // строки, недоступной клиенту. Вход в такой аккаунт возможен только через OAuth
  // (или сброс пароля по email). Никогда не совпадёт с реальным вводом.
  function randomPasswordHash(): Promise<string> {
    return hashPassword(`!oauth!${newId()}${newId()}`);
  }

  return {
    // Сохраняем одноразовый state (+ verifier для VK) и попутно чистим протухшие.
    async saveState(input: {
      state: string;
      provider: OAuthProvider;
      app: OAuthApp;
      verifier: string | null;
    }): Promise<void> {
      await db.insert(oauthStates).values({
        state: input.state,
        provider: input.provider,
        app: input.app,
        verifier: input.verifier,
      });
      const cutoff = new Date(now().getTime() - STATE_MAX_AGE_MS);
      await db.delete(oauthStates).where(lt(oauthStates.createdAt, cutoff));
    },

    // Одноразовое чтение state: возвращаем строку и сразу удаляем (защита от повтора).
    // null — state не найден (не выдан, протух и вычищен, либо уже использован).
    async popState(state: string): Promise<OAuthStateRow | null> {
      const [row] = await db.delete(oauthStates).where(eq(oauthStates.state, state)).returning({
        state: oauthStates.state,
        provider: oauthStates.provider,
        app: oauthStates.app,
        verifier: oauthStates.verifier,
      });
      return row ?? null;
    },

    async findAccount(
      provider: OAuthProvider,
      providerUserId: string,
    ): Promise<OAuthAccountRow | null> {
      const [row] = await db
        .select()
        .from(oauthAccounts)
        .where(
          and(
            eq(oauthAccounts.provider, provider),
            eq(oauthAccounts.providerUserId, providerUserId),
          ),
        );
      return row ?? null;
    },

    // Создаёт нового тренера под OAuth-вход (пароль недоступен) и возвращает его id.
    async createTrainerAccount(input: {
      email: string;
      firstName: string;
      lastName: string;
    }): Promise<string> {
      const id = newId();
      await db.insert(trainers).values({
        id,
        email: input.email,
        passwordHash: await randomPasswordHash(),
        firstName: input.firstName,
        lastName: input.lastName,
      });
      return id;
    },

    // Создаёт новый клиентский аккаунт под OAuth-вход (пароль недоступен) и возвращает id.
    async createClientAccount(input: {
      email: string;
      firstName: string;
      lastName: string;
    }): Promise<string> {
      const id = newId();
      await db.insert(clientAccounts).values({
        id,
        email: input.email,
        passwordHash: await randomPasswordHash(),
        firstName: input.firstName,
        lastName: input.lastName,
      });
      return id;
    },

    // Ищем существующего тренера по email (для линковки OAuth к уже заведённому аккаунту).
    async findTrainerIdByEmail(email: string): Promise<string | null> {
      const [row] = await db
        .select({ id: trainers.id })
        .from(trainers)
        .where(eq(trainers.email, email));
      return row?.id ?? null;
    },

    async findClientAccountIdByEmail(email: string): Promise<string | null> {
      const [row] = await db
        .select({ id: clientAccounts.id })
        .from(clientAccounts)
        .where(eq(clientAccounts.email, email));
      return row?.id ?? null;
    },

    // Привязывает аккаунт провайдера к субъекту ОДНОГО контура (trainerId XOR clientAccountId).
    async linkAccount(input: {
      provider: OAuthProvider;
      providerUserId: string;
      trainerId?: string;
      clientAccountId?: string;
    }): Promise<void> {
      await db.insert(oauthAccounts).values({
        id: newId(),
        provider: input.provider,
        providerUserId: input.providerUserId,
        trainerId: input.trainerId ?? null,
        clientAccountId: input.clientAccountId ?? null,
      });
    },
  };
}

export type OAuthRepo = ReturnType<typeof makeOAuthRepo>;
