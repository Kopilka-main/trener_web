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
import { AppError, unauthorized } from '../../errors.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней

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
  contacts: { type: string; value: string }[];
  avatarFileId?: string | null;
}): TrainerResponse {
  return {
    id: t.id,
    email: t.email,
    firstName: t.firstName,
    lastName: t.lastName,
    title: t.title,
    bio: t.bio,
    contacts: t.contacts,
    avatarFileId: t.avatarFileId ?? null,
  };
}

export function makeAuthService(
  repo: AuthRepo,
  filesRepo: FilesRepo,
  storage: Storage,
  deps: AuthDeps,
) {
  async function startSession(trainerId: string): Promise<Session> {
    const token = deps.newId();
    const expiresAt = new Date(deps.now().getTime() + SESSION_TTL_MS);
    await repo.createSession({ id: token, trainerId, expiresAt });
    return { token, expiresAt };
  }

  return {
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

    async me(trainerId: string): Promise<TrainerResponse> {
      const trainer = await repo.findTrainerById(trainerId);
      if (!trainer) throw unauthorized('Сессия недействительна');
      return toTrainerResponse(trainer);
    },

    async updateMe(trainerId: string, input: UpdateTrainerRequest): Promise<TrainerResponse> {
      const patch: {
        firstName?: string;
        lastName?: string;
        title?: string | null;
        bio?: string | null;
        contacts?: { type: string; value: string }[];
      } = {};
      if (input.firstName !== undefined) patch.firstName = input.firstName;
      if (input.lastName !== undefined) patch.lastName = input.lastName;
      if (input.title !== undefined) patch.title = input.title ?? null;
      if (input.bio !== undefined) patch.bio = input.bio ?? null;
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
