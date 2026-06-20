import { and, eq, ne } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { clients, trainerClients } from '../../db/schema.js';
import type { ClientStatus, Contact } from '@trener/shared';

export type ClientRow = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  accountId: string | null;
  birthDate: string | null;
  notes: string | null;
  status: ClientStatus;
  contacts: Contact[];
  tags: string[];
  isOnline: number; // 0/1 в БД
  avatarFileId: string | null;
  createdAt: Date;
};

export type CreateClientInput = {
  clientId: string;
  trainerId: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  accountId?: string | null;
  birthDate?: string | null;
  notes?: string | null;
  contacts?: Contact[];
  tags?: string[];
  isOnline?: boolean;
};

export type UpdateClientInput = {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  accountId?: string | null;
  birthDate?: string | null;
  notes?: string | null;
  status?: ClientStatus;
  contacts?: Contact[];
  tags?: string[];
  isOnline?: boolean;
};

export function makeClientsRepo(db: Db) {
  // Возвращает клиента в scope тренера (join clients × trainer_clients), либо null.
  async function getForTrainer(trainerId: string, clientId: string): Promise<ClientRow | null> {
    const [row] = await db
      .select({
        id: clients.id,
        firstName: clients.firstName,
        lastName: clients.lastName,
        phone: clients.phone,
        accountId: clients.accountId,
        birthDate: clients.birthDate,
        contacts: clients.contacts,
        tags: clients.tags,
        isOnline: clients.isOnline,
        avatarFileId: clients.avatarFileId,
        notes: trainerClients.notes,
        status: trainerClients.status,
        createdAt: trainerClients.createdAt,
      })
      .from(trainerClients)
      .innerJoin(clients, eq(clients.id, trainerClients.clientId))
      .where(and(eq(trainerClients.trainerId, trainerId), eq(trainerClients.clientId, clientId)));
    return row ?? null;
  }

  // Проверка связи тренер↔клиент. Локальная функция, чтобы переиспользовать без проблем с `this`.
  async function isLinkedLocal(trainerId: string, clientId: string): Promise<boolean> {
    const [row] = await db
      .select({ clientId: trainerClients.clientId })
      .from(trainerClients)
      .where(and(eq(trainerClients.trainerId, trainerId), eq(trainerClients.clientId, clientId)));
    return !!row;
  }

  return {
    getForTrainer,

    isLinked: isLinkedLocal,

    // Клиент тренера, уже привязанный к этому accountId (для предупреждения о дубле).
    // excludeClientId — исключить текущего редактируемого клиента. Нет такого → null.
    async findByAccountId(
      trainerId: string,
      accountId: string,
      excludeClientId?: string,
    ): Promise<{ id: string; firstName: string; lastName: string } | null> {
      const conds = [eq(trainerClients.trainerId, trainerId), eq(clients.accountId, accountId)];
      if (excludeClientId) conds.push(ne(clients.id, excludeClientId));
      const [row] = await db
        .select({ id: clients.id, firstName: clients.firstName, lastName: clients.lastName })
        .from(trainerClients)
        .innerJoin(clients, eq(clients.id, trainerClients.clientId))
        .where(and(...conds));
      return row ?? null;
    },

    async create(input: CreateClientInput): Promise<ClientRow> {
      await db.transaction(async (tx) => {
        await tx.insert(clients).values({
          id: input.clientId,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone ?? null,
          accountId: input.accountId ?? null,
          birthDate: input.birthDate ?? null,
          contacts: input.contacts ?? [],
          tags: input.tags ?? [],
          isOnline: input.isOnline ? 1 : 0,
        });
        await tx.insert(trainerClients).values({
          trainerId: input.trainerId,
          clientId: input.clientId,
          notes: input.notes ?? null,
          status: 'active',
        });
      });
      const row = await getForTrainer(input.trainerId, input.clientId);
      if (!row) throw new Error('insert failed');
      return row;
    },

    async listByTrainer(trainerId: string): Promise<ClientRow[]> {
      const rows = await db
        .select({
          id: clients.id,
          firstName: clients.firstName,
          lastName: clients.lastName,
          phone: clients.phone,
          accountId: clients.accountId,
          birthDate: clients.birthDate,
          contacts: clients.contacts,
          tags: clients.tags,
          isOnline: clients.isOnline,
          avatarFileId: clients.avatarFileId,
          notes: trainerClients.notes,
          status: trainerClients.status,
          createdAt: trainerClients.createdAt,
        })
        .from(trainerClients)
        .innerJoin(clients, eq(clients.id, trainerClients.clientId))
        .where(eq(trainerClients.trainerId, trainerId));
      return rows;
    },

    async update(
      trainerId: string,
      clientId: string,
      patch: UpdateClientInput,
    ): Promise<ClientRow | null> {
      // Изоляция: без связи тренер↔клиент не мутируем чужую персону.
      if (!(await isLinkedLocal(trainerId, clientId))) return null;
      const personPatch: Partial<{
        firstName: string;
        lastName: string;
        phone: string | null;
        accountId: string | null;
        birthDate: string | null;
        contacts: Contact[];
        tags: string[];
        isOnline: number;
      }> = {};
      if (patch.firstName !== undefined) personPatch.firstName = patch.firstName;
      if (patch.lastName !== undefined) personPatch.lastName = patch.lastName;
      if (patch.phone !== undefined) personPatch.phone = patch.phone;
      if (patch.accountId !== undefined) personPatch.accountId = patch.accountId;
      if (patch.birthDate !== undefined) personPatch.birthDate = patch.birthDate;
      if (patch.contacts !== undefined) personPatch.contacts = patch.contacts;
      if (patch.tags !== undefined) personPatch.tags = patch.tags;
      if (patch.isOnline !== undefined) personPatch.isOnline = patch.isOnline ? 1 : 0;
      const linkPatch: Partial<{ notes: string | null; status: ClientStatus }> = {};
      if (patch.notes !== undefined) linkPatch.notes = patch.notes;
      if (patch.status !== undefined) linkPatch.status = patch.status;

      if (Object.keys(personPatch).length > 0) {
        await db.update(clients).set(personPatch).where(eq(clients.id, clientId));
      }
      if (Object.keys(linkPatch).length > 0) {
        await db
          .update(trainerClients)
          .set(linkPatch)
          .where(
            and(eq(trainerClients.trainerId, trainerId), eq(trainerClients.clientId, clientId)),
          );
      }
      return getForTrainer(trainerId, clientId);
    },

    // Проставляет/снимает аватар клиента (только при наличии связи тренер↔клиент).
    // Возвращает предыдущий avatarFileId (для best-effort чистки старого файла),
    // либо undefined, если связи нет (нельзя трогать чужую персону).
    async setAvatar(
      trainerId: string,
      clientId: string,
      fileId: string | null,
    ): Promise<{ previousFileId: string | null } | undefined> {
      if (!(await isLinkedLocal(trainerId, clientId))) return undefined;
      const [prev] = await db
        .select({ avatarFileId: clients.avatarFileId })
        .from(clients)
        .where(eq(clients.id, clientId));
      if (!prev) return undefined;
      await db.update(clients).set({ avatarFileId: fileId }).where(eq(clients.id, clientId));
      return { previousFileId: prev.avatarFileId };
    },

    // «Удаление» = разрыв связи (персона и данные других тренеров сохраняются).
    async unlink(trainerId: string, clientId: string): Promise<boolean> {
      const res = await db
        .delete(trainerClients)
        .where(and(eq(trainerClients.trainerId, trainerId), eq(trainerClients.clientId, clientId)))
        .returning({ clientId: trainerClients.clientId });
      return res.length > 0;
    },
  };
}

export type ClientsRepo = ReturnType<typeof makeClientsRepo>;
