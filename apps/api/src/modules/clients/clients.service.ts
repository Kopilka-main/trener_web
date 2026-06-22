import type { ClientsRepo, ClientRow, UpdateClientInput } from './clients.repo.js';
import type { FilesRepo } from '../files/files.repo.js';
import type { Storage } from '../../files/storage.js';
import type {
  AccountProfileResponse,
  ClientResponse,
  CreateClientRequest,
  UpdateClientRequest,
} from '@trener/shared';
import { AppError, notFound } from '../../errors.js';

export type AccountProfile = {
  firstName: string;
  lastName: string;
  birthDate: string | null;
  contacts: { type: string; value: string }[];
};

export type ClientsDeps = {
  newId: () => string;
  accountExists: (id: string) => Promise<boolean>;
  /** Профиль клиентского аккаунта по id (для авто-заполнения карточки). */
  accountProfile: (id: string) => Promise<AccountProfile | null>;
  /** avatarFileId подключённого аккаунта (для «подтянуть аватар»), либо null. */
  accountAvatarFileId: (id: string) => Promise<string | null>;
};

// Расширение файла выводим ИЗ MIME по whitelist (НЕ из имени файла клиента).
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export type AvatarUploadInput = {
  fileBuffer: Buffer;
  mime: string;
  originalName: string | null;
};

function toResponse(r: ClientRow): ClientResponse {
  return {
    id: r.id,
    firstName: r.firstName,
    lastName: r.lastName,
    phone: r.phone,
    accountId: r.accountId,
    birthDate: r.birthDate,
    notes: r.notes,
    status: r.status,
    contacts: r.contacts ?? [],
    tags: r.tags ?? [],
    isOnline: r.isOnline === 1,
    avatarFileId: r.avatarFileId,
    createdAt: r.createdAt.toISOString(),
  };
}

export function makeClientsService(
  repo: ClientsRepo,
  filesRepo: FilesRepo,
  storage: Storage,
  deps: ClientsDeps,
) {
  // Сохранить буфер аватара в скоупе (тренер, клиент): записать файл, создать
  // запись files, проставить avatarFileId, подчистить прежний аватар. Общий код
  // для загрузки (setAvatar) и копии из аккаунта (avatarFromAccount).
  async function applyAvatar(
    trainerId: string,
    clientId: string,
    fileBuffer: Buffer,
    mime: string,
    ext: string,
    originalName: string | null,
  ): Promise<ClientResponse> {
    const fileId = deps.newId();
    const saved = await storage.save(trainerId, clientId, fileId, ext, fileBuffer);

    let result: { previousFileId: string | null } | undefined;
    try {
      await filesRepo.create({
        id: fileId,
        trainerId,
        clientId,
        accountId: null,
        mime,
        sizeBytes: saved.sizeBytes,
        storagePath: saved.storagePath,
        originalName,
      });
      result = await repo.setAvatar(trainerId, clientId, fileId);
    } catch (err) {
      await storage.remove(saved.storagePath).catch(() => undefined);
      throw err;
    }

    if (!result) {
      await filesRepo.delete(trainerId, fileId).catch(() => undefined);
      await storage.remove(saved.storagePath).catch(() => undefined);
      throw notFound('Клиент не найден');
    }

    if (result.previousFileId && result.previousFileId !== fileId) {
      const old = await filesRepo.delete(trainerId, result.previousFileId).catch(() => null);
      if (old) await storage.remove(old.storagePath).catch(() => undefined);
    }

    const row = await repo.getForTrainer(trainerId, clientId);
    if (!row) throw notFound('Клиент не найден');
    return toResponse(row);
  }

  return {
    async create(trainerId: string, input: CreateClientRequest): Promise<ClientResponse> {
      // Привязка при создании: непустой accountId должен существовать (как в update)
      // и не должен быть уже привязан к другому клиенту тренера (дубль в записной книжке).
      if (input.accountId != null && input.accountId !== '') {
        const exists = await deps.accountExists(input.accountId);
        if (!exists) {
          throw new AppError(422, 'CLIENT_ACCOUNT_NOT_FOUND', 'Клиентский аккаунт не найден');
        }
        const dup = await repo.findByAccountId(trainerId, input.accountId);
        if (dup) {
          throw new AppError(
            409,
            'CLIENT_ALREADY_LINKED',
            `Клиент с таким ID уже есть: ${dup.firstName} ${dup.lastName}`.trim(),
          );
        }
      }
      const row = await repo.create({
        clientId: deps.newId(),
        trainerId,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone ?? null,
        accountId: input.accountId ?? null,
        birthDate: input.birthDate ?? null,
        notes: input.notes ?? null,
        contacts: input.contacts ?? [],
        tags: input.tags ?? [],
        isOnline: input.isOnline,
      });
      return toResponse(row);
    },

    // Проверка кода привязки тренером ДО сохранения: существует ли такой клиентский
    // аккаунт И не привязан ли он уже к другому клиенту этого тренера (дубль). Возвращает
    // имя такого клиента для предупреждения. excludeClientId — текущий редактируемый.
    async checkConnectCode(
      trainerId: string,
      code: string,
      excludeClientId?: string,
    ): Promise<{
      exists: boolean;
      linkedClient: { id: string; firstName: string; lastName: string } | null;
    }> {
      const c = code.trim();
      if (c === '') return { exists: false, linkedClient: null };
      const [exists, linkedClient] = await Promise.all([
        deps.accountExists(c),
        repo.findByAccountId(trainerId, c, excludeClientId),
      ]);
      return { exists, linkedClient };
    },

    // Профиль подключённого клиентского аккаунта — для кнопки «Получить данные».
    async getAccountProfile(accountId: string): Promise<AccountProfileResponse> {
      const p = await deps.accountProfile(accountId.trim());
      if (!p) throw notFound('Клиентский аккаунт не найден');
      return {
        firstName: p.firstName,
        lastName: p.lastName,
        birthDate: p.birthDate,
        contacts: p.contacts,
      };
    },

    async list(trainerId: string): Promise<ClientResponse[]> {
      const rows = await repo.listByTrainer(trainerId);
      return rows.map(toResponse);
    },

    async get(trainerId: string, clientId: string): Promise<ClientResponse> {
      const row = await repo.getForTrainer(trainerId, clientId);
      if (!row) throw notFound('Клиент не найден');
      return toResponse(row);
    },

    async update(
      trainerId: string,
      clientId: string,
      patch: UpdateClientRequest,
    ): Promise<ClientResponse> {
      // Привязка клиентского аккаунта: непустой accountId должен существовать и не быть
      // уже привязан к ДРУГОМУ клиенту тренера. Пустая строка/null = отвязка — не проверяем.
      if (patch.accountId != null && patch.accountId !== '') {
        const exists = await deps.accountExists(patch.accountId);
        if (!exists) {
          throw new AppError(422, 'CLIENT_ACCOUNT_NOT_FOUND', 'Клиентский аккаунт не найден');
        }
        const dup = await repo.findByAccountId(trainerId, patch.accountId, clientId);
        if (dup) {
          throw new AppError(
            409,
            'CLIENT_ALREADY_LINKED',
            `Клиент с таким ID уже есть: ${dup.firstName} ${dup.lastName}`.trim(),
          );
        }
      }

      // exactOptionalPropertyTypes: задаём только определённые поля.
      // phone/notes: null трактуем как «не трогать» (YAGNI — очистка через null позже).
      const repoPatch: UpdateClientInput = {};
      if (patch.firstName !== undefined) repoPatch.firstName = patch.firstName;
      if (patch.lastName !== undefined) repoPatch.lastName = patch.lastName;
      if (patch.phone != null) repoPatch.phone = patch.phone;
      // accountId: null трактуем как «отключить» (очистка), undefined — «не трогать».
      if (patch.accountId !== undefined) repoPatch.accountId = patch.accountId;
      // birthDate: null = очистка, undefined = «не трогать».
      if (patch.birthDate !== undefined) repoPatch.birthDate = patch.birthDate;
      if (patch.notes != null) repoPatch.notes = patch.notes;
      if (patch.status !== undefined) repoPatch.status = patch.status;
      if (patch.contacts !== undefined) repoPatch.contacts = patch.contacts;
      if (patch.tags !== undefined) repoPatch.tags = patch.tags;
      if (patch.isOnline !== undefined) repoPatch.isOnline = patch.isOnline;
      const row = await repo.update(trainerId, clientId, repoPatch);
      if (!row) throw notFound('Клиент не найден');
      return toResponse(row);
    },

    async unlink(trainerId: string, clientId: string): Promise<void> {
      const ok = await repo.unlink(trainerId, clientId);
      if (!ok) throw notFound('Клиент не найден');
    },

    // Загрузка аватара. Порядок как в progress-photos: проверка mime → storage.save
    // → filesRepo.create → repo.setAvatar. Не в транзакции (storage пишет вне БД);
    // при ошибке БД-вставки чистим только что записанный файл best-effort.
    // Старый аватар (если был) удаляем best-effort после успешной замены.
    async setAvatar(
      trainerId: string,
      clientId: string,
      input: AvatarUploadInput,
    ): Promise<ClientResponse> {
      const ext = MIME_EXT[input.mime];
      if (!ext) {
        throw new AppError(400, 'UNSUPPORTED_MEDIA_TYPE', 'Неподдерживаемый тип файла');
      }
      return applyAvatar(
        trainerId,
        clientId,
        input.fileBuffer,
        input.mime,
        ext,
        input.originalName,
      );
    },

    // Подтянуть аватар подключённого аккаунта в карточку клиента (копия файла).
    // Нет аккаунта / у аккаунта нет аватара / неподдерживаемый тип → no-op:
    // возвращаем карточку как есть (приоритет «есть — тянем, нет — не трогаем»).
    async avatarFromAccount(trainerId: string, clientId: string): Promise<ClientResponse> {
      const row = await repo.getForTrainer(trainerId, clientId);
      if (!row) throw notFound('Клиент не найден');
      const accountId = row.accountId;
      if (!accountId) return toResponse(row);
      const fileId = await deps.accountAvatarFileId(accountId);
      if (!fileId) return toResponse(row);
      const file = await filesRepo.getById(fileId);
      if (!file) return toResponse(row);
      const ext = MIME_EXT[file.mime];
      if (!ext) return toResponse(row);
      const buffer = await storage.read(file.storagePath);
      return applyAvatar(trainerId, clientId, buffer, file.mime, ext, file.originalName);
    },

    // Снять аватар: avatarFileId = null, старый файл удалить best-effort.
    async removeAvatar(trainerId: string, clientId: string): Promise<void> {
      const result = await repo.setAvatar(trainerId, clientId, null);
      if (!result) throw notFound('Клиент не найден');
      if (result.previousFileId) {
        const old = await filesRepo.delete(trainerId, result.previousFileId).catch(() => null);
        if (old) await storage.remove(old.storagePath).catch(() => undefined);
      }
    },
  };
}

export type ClientsService = ReturnType<typeof makeClientsService>;
