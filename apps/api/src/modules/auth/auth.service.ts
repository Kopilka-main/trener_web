import type { AuthRepo } from './auth.repo.js';
import type { FilesRepo } from '../files/files.repo.js';
import type { Storage } from '../../files/storage.js';
import type {
  LoginRequest,
  RegisterRequest,
  TrainerResponse,
  UpdateTrainerRequest,
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

export type AuthDeps = { newId: () => string; now: () => Date };

export type Session = { token: string; expiresAt: Date };

export type AvatarUploadInput = {
  fileBuffer: Buffer;
  mime: string;
  originalName: string | null;
};

function toTrainerResponse(t: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  title: string | null;
  bio: string | null;
  birthDate?: string | null;
  contacts: { type: string; value: string }[];
  avatarFileId?: string | null;
  pendingDeletionAt?: Date | null;
}): TrainerResponse {
  return {
    id: t.id,
    email: t.email,
    firstName: t.firstName,
    lastName: t.lastName,
    title: t.title,
    bio: t.bio,
    birthDate: t.birthDate ?? null,
    contacts: t.contacts,
    avatarFileId: t.avatarFileId ?? null,
    pendingDeletionAt: t.pendingDeletionAt ? t.pendingDeletionAt.toISOString() : null,
  };
}

export function makeAuthService(
  repo: AuthRepo,
  filesRepo: FilesRepo,
  storage: Storage,
  deps: AuthDeps,
  db: Db,
  mailer: Mailer,
) {
  async function startSession(trainerId: string): Promise<Session> {
    const token = deps.newId();
    const expiresAt = new Date(deps.now().getTime() + SESSION_TTL_MS);
    await repo.createSession({ id: token, trainerId, expiresAt });
    return { token, expiresAt };
  }

  return {
    // Публичная точка создания сессии по trainerId (для OAuth-входа): тонкая обёртка
    // над приватным createSession. Токен — непрозрачный (deps.newId), TTL — как у login.
    startSessionForTrainer(trainerId: string): Promise<Session> {
      return startSession(trainerId);
    },

    async register(
      input: RegisterRequest,
    ): Promise<{ trainer: TrainerResponse; session: Session }> {
      const existing = await repo.findTrainerByEmail(input.email);
      if (existing) throw new AppError(409, 'EMAIL_TAKEN', 'Email уже зарегистрирован');
      const passwordHash = await hashPassword(input.password);
      const trainer = await repo.createTrainer({
        id: deps.newId(),
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
      });
      if (!trainer) throw new AppError(500, 'INTERNAL', 'Не удалось создать тренера');
      const session = await startSession(trainer.id);
      return { trainer: toTrainerResponse(trainer), session };
    },

    async login(input: LoginRequest): Promise<{ trainer: TrainerResponse; session: Session }> {
      const trainer = await repo.findTrainerByEmail(input.email);
      if (!trainer) throw unauthorized('Неверный email или пароль');
      const ok = await verifyPassword(trainer.passwordHash, input.password);
      if (!ok) throw unauthorized('Неверный email или пароль');
      const session = await startSession(trainer.id);
      return { trainer: toTrainerResponse(trainer), session };
    },

    async logout(token: string): Promise<void> {
      await repo.deleteSession(token);
    },

    // Запрос кода сброса пароля. Не раскрываем существование email: если тренера нет —
    // молча выходим (роут всё равно вернёт 200). Письмо шлём fire-and-forget, чтобы
    // ответ не зависел от почтового провайдера и не выдавал тайминги.
    async forgotPassword(email: string): Promise<void> {
      const trainer = await repo.findTrainerByEmail(email);
      if (!trainer) return;
      const code = await createCode(db, {
        subjectType: 'trainer',
        subjectId: trainer.id,
        purpose: 'reset-password',
        newId: deps.newId,
        now: deps.now(),
      });
      void sendResetPasswordEmail(mailer, trainer.email, code).catch(() => undefined);
    },

    // Сброс пароля по коду. Неверный/просроченный код или отсутствие тренера → 400 с
    // общим сообщением (не раскрываем, что именно не так). Успех → новый argon2-хэш.
    async resetPassword(email: string, code: string, password: string): Promise<void> {
      const invalid = new AppError(400, 'INVALID_CODE', 'Неверный или просроченный код');
      const trainer = await repo.findTrainerByEmail(email);
      if (!trainer) throw invalid;
      const ok = await verifyCode(db, {
        subjectType: 'trainer',
        subjectId: trainer.id,
        code,
        purpose: 'reset-password',
        now: deps.now(),
      });
      if (!ok) throw invalid;
      await repo.updatePasswordHash(trainer.id, await hashPassword(password));
    },

    async me(trainerId: string): Promise<TrainerResponse> {
      const trainer = await repo.findTrainerById(trainerId);
      if (!trainer) throw unauthorized('Сессия недействительна');
      return toTrainerResponse(trainer);
    },

    // Запросить удаление аккаунта тренера: момент сноса = now + окно отмены (3 дня).
    async requestDeletion(trainerId: string): Promise<{ pendingDeletionAt: string }> {
      const trainer = await repo.findTrainerById(trainerId);
      if (!trainer) throw unauthorized('Сессия недействительна');
      const at = new Date(deps.now().getTime() + DELETION_GRACE_MS);
      await repo.setPendingDeletion(trainerId, at);
      return { pendingDeletionAt: at.toISOString() };
    },

    // Отменить запланированное удаление (в течение окна).
    async cancelDeletion(trainerId: string): Promise<void> {
      const trainer = await repo.findTrainerById(trainerId);
      if (!trainer) throw unauthorized('Сессия недействительна');
      await repo.setPendingDeletion(trainerId, null);
    },

    // Снести тренеров с истёкшим окном (вызывает планировщик): для каждого читаем пути
    // файлов, удаляем строку (каскад всего воркспейса), затем чистим файлы с диска.
    async purgeExpiredDeletions(): Promise<number> {
      const expired = await repo.findExpiredDeletions(deps.now());
      for (const t of expired) {
        const paths = await repo.findTrainerFileStoragePaths(t.id);
        await repo.deleteTrainer(t.id);
        for (const p of paths) await storage.remove(p).catch(() => undefined);
      }
      return expired.length;
    },

    async updateMe(trainerId: string, input: UpdateTrainerRequest): Promise<TrainerResponse> {
      const patch: {
        firstName?: string;
        lastName?: string;
        title?: string | null;
        bio?: string | null;
        birthDate?: string | null;
        contacts?: { type: string; value: string }[];
      } = {};
      if (input.firstName !== undefined) patch.firstName = input.firstName;
      if (input.lastName !== undefined) patch.lastName = input.lastName;
      if (input.title !== undefined) patch.title = input.title ?? null;
      if (input.bio !== undefined) patch.bio = input.bio ?? null;
      if (input.birthDate !== undefined) patch.birthDate = input.birthDate ?? null;
      if (input.contacts !== undefined) patch.contacts = input.contacts;
      const trainer = await repo.updateTrainer(trainerId, patch);
      if (!trainer) throw unauthorized('Сессия недействительна');
      return toTrainerResponse(trainer);
    },

    // Загрузка аватара тренера (зеркало clients.service.setAvatar, владелец — тренер):
    // mime→ext, storage.save, filesRepo.create({trainerId, clientId:null, accountId:null}),
    // repo.setAvatar; прежний файл удаляем best-effort через filesRepo.delete(trainerId, …).
    async setAvatar(trainerId: string, input: AvatarUploadInput): Promise<TrainerResponse> {
      const ext = MIME_EXT[input.mime];
      if (!ext) {
        throw new AppError(400, 'UNSUPPORTED_MEDIA_TYPE', 'Неподдерживаемый тип файла');
      }

      const fileId = deps.newId();
      const saved = await storage.save(trainerId, null, fileId, ext, input.fileBuffer);

      let result: { previousFileId: string | null } | null;
      try {
        await filesRepo.create({
          id: fileId,
          trainerId,
          clientId: null,
          accountId: null,
          mime: input.mime,
          sizeBytes: saved.sizeBytes,
          storagePath: saved.storagePath,
          originalName: input.originalName,
        });
        result = await repo.setAvatar(trainerId, fileId);
      } catch (err) {
        await storage.remove(saved.storagePath).catch(() => undefined);
        throw err;
      }

      // Тренер не найден (сессия протухла): откатываем созданный файл.
      if (!result) {
        await filesRepo.delete(trainerId, fileId).catch(() => undefined);
        await storage.remove(saved.storagePath).catch(() => undefined);
        throw unauthorized('Сессия недействительна');
      }

      // Старый аватар: удаляем строку files (каскадом обнулит ссылку) + файл с диска.
      if (result.previousFileId && result.previousFileId !== fileId) {
        const old = await filesRepo.delete(trainerId, result.previousFileId).catch(() => null);
        if (old) await storage.remove(old.storagePath).catch(() => undefined);
      }

      const trainer = await repo.findTrainerById(trainerId);
      if (!trainer) throw unauthorized('Сессия недействительна');
      return toTrainerResponse(trainer);
    },

    // Снять аватар: avatarFileId = null, старый файл удалить best-effort.
    async removeAvatar(trainerId: string): Promise<void> {
      const result = await repo.setAvatar(trainerId, null);
      if (!result) throw unauthorized('Сессия недействительна');
      if (result.previousFileId) {
        const old = await filesRepo.delete(trainerId, result.previousFileId).catch(() => null);
        if (old) await storage.remove(old.storagePath).catch(() => undefined);
      }
    },
  };
}

export type AuthService = ReturnType<typeof makeAuthService>;
