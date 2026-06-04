import type { ClientAuthRepo } from './client-auth.repo.js';
import type { FilesRepo } from '../files/files.repo.js';
import type { Storage } from '../../files/storage.js';
import type {
  ClientLoginRequest,
  ClientRegisterRequest,
  ClientAccountResponse,
  ClientLink,
  ClientMeResponse,
  UpdateClientAccountRequest,
} from '@trener/shared';
import { hashPassword, verifyPassword } from '../../auth/password.js';
import { AppError, unauthorized } from '../../errors.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней

// Расширение файла выводим ИЗ MIME по whitelist (НЕ из имени файла клиента).
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export type ClientAuthDeps = { newId: () => string; now: () => Date };
export type ClientSession = { token: string; expiresAt: Date };

export type AvatarUploadInput = {
  fileBuffer: Buffer;
  mime: string;
  originalName: string | null;
};

function toAccountResponse(a: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarFileId: string | null;
  birthDate: string | null;
  contacts: { type: string; value: string }[];
  bio: string | null;
}): ClientAccountResponse {
  return {
    id: a.id,
    email: a.email,
    firstName: a.firstName,
    lastName: a.lastName,
    avatarFileId: a.avatarFileId,
    birthDate: a.birthDate,
    contacts: a.contacts ?? [],
    bio: a.bio,
  };
}

export function makeClientAuthService(
  repo: ClientAuthRepo,
  filesRepo: FilesRepo,
  storage: Storage,
  deps: ClientAuthDeps,
) {
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

    async updateMe(
      clientAccountId: string,
      input: UpdateClientAccountRequest,
    ): Promise<ClientAccountResponse> {
      const patch: {
        firstName?: string;
        lastName?: string;
        birthDate?: string | null;
        contacts?: { type: string; value: string }[];
        bio?: string | null;
      } = {};
      if (input.firstName !== undefined) patch.firstName = input.firstName;
      if (input.lastName !== undefined) patch.lastName = input.lastName;
      if (input.birthDate !== undefined) patch.birthDate = input.birthDate ?? null;
      if (input.contacts !== undefined) patch.contacts = input.contacts;
      if (input.bio !== undefined) patch.bio = input.bio ?? null;
      const account = await repo.updateAccount(clientAccountId, patch);
      if (!account) throw unauthorized('Сессия недействительна');
      return toAccountResponse(account);
    },

    // Чтение avatarFileId для раздачи (роут проверяет принадлежность файла аккаунту).
    findAvatarFileId(clientAccountId: string): Promise<string | null> {
      return repo.findAvatarFileId(clientAccountId);
    },

    // Загрузка аватара клиент-аккаунта (зеркало clients.service.setAvatar, владелец —
    // аккаунт): mime→ext, storage.save('acct_'+id, null,…), filesRepo.create({accountId,
    // trainerId:null, clientId:null}), repo.setAvatar; прежний файл удаляем best-effort
    // через filesRepo.deleteById (файл принадлежит аккаунту, не тренеру).
    async setAvatar(
      clientAccountId: string,
      input: AvatarUploadInput,
    ): Promise<ClientAccountResponse> {
      const ext = MIME_EXT[input.mime];
      if (!ext) {
        throw new AppError(400, 'UNSUPPORTED_MEDIA_TYPE', 'Неподдерживаемый тип файла');
      }

      const fileId = deps.newId();
      const saved = await storage.save(
        `acct_${clientAccountId}`,
        null,
        fileId,
        ext,
        input.fileBuffer,
      );

      let result: { previousFileId: string | null } | null;
      try {
        await filesRepo.create({
          id: fileId,
          trainerId: null,
          clientId: null,
          accountId: clientAccountId,
          mime: input.mime,
          sizeBytes: saved.sizeBytes,
          storagePath: saved.storagePath,
          originalName: input.originalName,
        });
        result = await repo.setAvatar(clientAccountId, fileId);
      } catch (err) {
        await storage.remove(saved.storagePath).catch(() => undefined);
        throw err;
      }

      // Аккаунт не найден (сессия протухла): откатываем созданный файл.
      if (!result) {
        await filesRepo.deleteById(fileId).catch(() => undefined);
        await storage.remove(saved.storagePath).catch(() => undefined);
        throw unauthorized('Сессия недействительна');
      }

      // Старый аватар: удаляем строку files (каскадом обнулит ссылку) + файл с диска.
      if (result.previousFileId && result.previousFileId !== fileId) {
        const old = await filesRepo.deleteById(result.previousFileId).catch(() => null);
        if (old) await storage.remove(old.storagePath).catch(() => undefined);
      }

      const account = await repo.findAccountById(clientAccountId);
      if (!account) throw unauthorized('Сессия недействительна');
      return toAccountResponse(account);
    },

    // Снять аватар: avatarFileId = null, старый файл удалить best-effort.
    async removeAvatar(clientAccountId: string): Promise<void> {
      const result = await repo.setAvatar(clientAccountId, null);
      if (!result) throw unauthorized('Сессия недействительна');
      if (result.previousFileId) {
        const old = await filesRepo.deleteById(result.previousFileId).catch(() => null);
        if (old) await storage.remove(old.storagePath).catch(() => undefined);
      }
    },
  };
}

export type ClientAuthService = ReturnType<typeof makeClientAuthService>;
