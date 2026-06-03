import type { ClientAuthRepo } from './client-auth.repo.js';
import type {
  ClientLoginRequest,
  ClientRegisterRequest,
  ClientAccountResponse,
  ClientLink,
  ClientMeResponse,
} from '@trener/shared';
import { hashPassword, verifyPassword } from '../../auth/password.js';
import { AppError, unauthorized } from '../../errors.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней

export type ClientAuthDeps = { newId: () => string; now: () => Date };
export type ClientSession = { token: string; expiresAt: Date };

function toAccountResponse(a: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarFileId: string | null;
}): ClientAccountResponse {
  return {
    id: a.id,
    email: a.email,
    firstName: a.firstName,
    lastName: a.lastName,
    avatarFileId: a.avatarFileId,
  };
}

export function makeClientAuthService(repo: ClientAuthRepo, deps: ClientAuthDeps) {
  async function startSession(clientAccountId: string): Promise<ClientSession> {
    const token = deps.newId();
    const expiresAt = new Date(deps.now().getTime() + SESSION_TTL_MS);
    await repo.createSession({ id: token, clientAccountId, expiresAt });
    return { token, expiresAt };
  }

  return {
    // Резолвер скоупа — переиспользуется фичевыми клиентскими роутами в секционных спеках.
    resolveScope(clientAccountId: string): Promise<ClientLink> {
      return repo.findScopeByAccountId(clientAccountId);
    },

    async register(
      input: ClientRegisterRequest,
    ): Promise<{ account: ClientAccountResponse; session: ClientSession }> {
      const existing = await repo.findAccountByEmail(input.email);
      if (existing) throw new AppError(409, 'EMAIL_TAKEN', 'Email уже зарегистрирован');
      const passwordHash = await hashPassword(input.password);
      const account = await repo.createAccount({
        id: deps.newId(),
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
      });
      if (!account) throw new AppError(500, 'INTERNAL', 'Не удалось создать аккаунт');
      const session = await startSession(account.id);
      return { account: toAccountResponse(account), session };
    },

    async login(
      input: ClientLoginRequest,
    ): Promise<{ account: ClientAccountResponse; session: ClientSession }> {
      const account = await repo.findAccountByEmail(input.email);
      if (!account) throw unauthorized('Неверный email или пароль');
      const ok = await verifyPassword(account.passwordHash, input.password);
      if (!ok) throw unauthorized('Неверный email или пароль');
      const session = await startSession(account.id);
      return { account: toAccountResponse(account), session };
    },

    async logout(token: string): Promise<void> {
      await repo.deleteSession(token);
    },

    async me(clientAccountId: string): Promise<ClientMeResponse> {
      const account = await repo.findAccountById(clientAccountId);
      if (!account) throw unauthorized('Сессия недействительна');
      const link = await repo.findScopeByAccountId(clientAccountId);
      return { account: toAccountResponse(account), link };
    },
  };
}

export type ClientAuthService = ReturnType<typeof makeClientAuthService>;
