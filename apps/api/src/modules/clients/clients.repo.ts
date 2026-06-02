import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { clients, trainerClients } from '../../db/schema.js';
import type { ClientStatus, Contact } from '@trener/shared';

export type ClientRow = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  notes: string | null;
  status: ClientStatus;
  contacts: Contact[];
  tags: string[];
  createdAt: Date;
};

export type CreateClientInput = {
  clientId: string;
  trainerId: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  notes?: string | null;
  contacts?: Contact[];
  tags?: string[];
};

export type UpdateClientInput = {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  notes?: string | null;
  status?: ClientStatus;
  contacts?: Contact[];
  tags?: string[];
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
        contacts: clients.contacts,
        tags: clients.tags,
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

    async create(input: CreateClientInput): Promise<ClientRow> {
      await db.transaction(async (tx) => {
        await tx.insert(clients).values({
          id: input.clientId,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone ?? null,
          contacts: input.contacts ?? [],
          tags: input.tags ?? [],
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
          contacts: clients.contacts,
          tags: clients.tags,
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
        contacts: Contact[];
        tags: string[];
      }> = {};
      if (patch.firstName !== undefined) personPatch.firstName = patch.firstName;
      if (patch.lastName !== undefined) personPatch.lastName = patch.lastName;
      if (patch.phone !== undefined) personPatch.phone = patch.phone;
      if (patch.contacts !== undefined) personPatch.contacts = patch.contacts;
      if (patch.tags !== undefined) personPatch.tags = patch.tags;
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
