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
import { createCode, verifyCode } from '../../auth/email-codes.js';
import { sendResetPasswordEmail, type Mailer } from '../../auth/mailer.js';
import type { Db } from '../../db/client.js';
import { AppError, unauthorized } from '../../errors.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней
const DELETION_GRACE_MS = 3 * 24 * 60 * 60 * 1000; // окно отмены удаления — 3 дня

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
  birthYear?: number | null;
  contacts: { type: string; value: string }[];
  bio: string | null;
  sessionReminderEnabled?: boolean;
}): ClientAccountResponse {
  return {
    id: a.id,
    email: a.email,
    firstName: a.firstName,
    lastName: a.lastName,
    avatarFileId: a.avatarFileId,
    birthDate: a.birthDate,
    birthYear: a.birthYear ?? null,
    contacts: a.contacts ?? [],
    bio: a.bio,
    // Дефолт true, если поле не пришло из старой строки (миграция ставит default true).
    sessionReminderEnabled: a.sessionReminderEnabled ?? true,
  };
}

export function makeClientAuthService(
  repo: ClientAuthRepo,
  filesRepo: FilesRepo,
  storage: Storage,
  deps: ClientAuthDeps,
  db: Db,
  mailer: Mailer,
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

    // Публичная точка создания сессии по clientAccountId (для OAuth-входа): тонкая
    // обёртка над приватным createSession. Токен непрозрачный, TTL — как у login.
    startSessionForClient(clientAccountId: string): Promise<ClientSession> {
      return startSession(clientAccountId);
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

    // Запрос кода сброса пароля. Не раскрываем существование email: нет аккаунта —
    // молча выходим (роут вернёт 200). Письмо fire-and-forget (ответ не ждёт SMTP).
    async forgotPassword(email: string): Promise<void> {
      const account = await repo.findAccountByEmail(email);
      if (!account) return;
      const code = await createCode(db, {
        subjectType: 'client',
        subjectId: account.id,
        purpose: 'reset-password',
        newId: deps.newId,
        now: deps.now(),
      });
      void sendResetPasswordEmail(mailer, account.email, code).catch(() => undefined);
    },

    // Сброс пароля по коду. Неверный/просроченный код или отсутствие аккаунта → 400 с
    // общим сообщением. Успех → новый argon2-хэш.
    async resetPassword(email: string, code: string, password: string): Promise<void> {
      const invalid = new AppError(400, 'INVALID_CODE', 'Неверный или просроченный код');
      const account = await repo.findAccountByEmail(email);
      if (!account) throw invalid;
      const ok = await verifyCode(db, {
        subjectType: 'client',
        subjectId: account.id,
        code,
        purpose: 'reset-password',
        now: deps.now(),
      });
      if (!ok) throw invalid;
      await repo.updatePasswordHash(account.id, await hashPassword(password));
    },

    async me(clientAccountId: string): Promise<ClientMeResponse> {
      const account = await repo.findAccountById(clientAccountId);
      if (!account) throw unauthorized('Сессия недействительна');
      const link = await repo.findScopeByAccountId(clientAccountId);
      return {
        account: toAccountResponse(account),
        link,
        pendingDeletionAt: account.pendingDeletionAt
          ? account.pendingDeletionAt.toISOString()
          : null,
      };
    },

    // Запросить удаление аккаунта: ставим момент сноса = now + окно отмены (3 дня).
    // Возвращаем ISO-дату, чтобы показать её в приложении.
    async requestDeletion(clientAccountId: string): Promise<{ pendingDeletionAt: string }> {
      const account = await repo.findAccountById(clientAccountId);
      if (!account) throw unauthorized('Сессия недействительна');
      const at = new Date(deps.now().getTime() + DELETION_GRACE_MS);
      await repo.setPendingDeletion(clientAccountId, at);
      return { pendingDeletionAt: at.toISOString() };
    },

    // Отменить запланированное удаление (в течение окна).
    async cancelDeletion(clientAccountId: string): Promise<void> {
      const account = await repo.findAccountById(clientAccountId);
      if (!account) throw unauthorized('Сессия недействительна');
      await repo.setPendingDeletion(clientAccountId, null);
    },

    // Снести аккаунты, у которых окно отмены истекло (вызывает планировщик).
    // Для каждого: отвязка от карточек клиентов + удаление строки (каскад сессий/
    // push/файлов) + чистка файла аватара с диска. Возвращает число удалённых.
    async purgeExpiredDeletions(): Promise<number> {
      const expired = await repo.findExpiredDeletions(deps.now());
      for (const acc of expired) {
        await repo.unlinkAccountFromClients(acc.id);
        // storagePath читаем ДО удаления — строка files уйдёт каскадом.
        let storagePath: string | null = null;
        if (acc.avatarFileId) {
          const f = await filesRepo.getById(acc.avatarFileId).catch(() => null);
          storagePath = f?.storagePath ?? null;
        }
        await repo.deleteAccount(acc.id);
        if (storagePath) await storage.remove(storagePath).catch(() => undefined);
      }
      return expired.length;
    },

    async updateMe(
      clientAccountId: string,
      input: UpdateClientAccountRequest,
    ): Promise<ClientAccountResponse> {
      const patch: {
        firstName?: string;
        lastName?: string;
        birthDate?: string | null;
        birthYear?: number | null;
        contacts?: { type: string; value: string }[];
        bio?: string | null;
        sessionReminderEnabled?: boolean;
      } = {};
      if (input.firstName !== undefined) patch.firstName = input.firstName;
      if (input.lastName !== undefined) patch.lastName = input.lastName;
      if (input.birthDate !== undefined) patch.birthDate = input.birthDate ?? null;
      if (input.birthYear !== undefined) patch.birthYear = input.birthYear ?? null;
      if (input.contacts !== undefined) patch.contacts = input.contacts;
      if (input.bio !== undefined) patch.bio = input.bio ?? null;
      if (input.sessionReminderEnabled !== undefined) {
        patch.sessionReminderEnabled = input.sessionReminderEnabled;
      }
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
