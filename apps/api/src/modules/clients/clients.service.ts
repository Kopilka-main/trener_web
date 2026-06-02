import type { ClientsRepo, ClientRow, UpdateClientInput } from './clients.repo.js';
import type { ClientResponse, CreateClientRequest, UpdateClientRequest } from '@trener/shared';
import { notFound } from '../../errors.js';

export type ClientsDeps = { newId: () => string };

function toResponse(r: ClientRow): ClientResponse {
  return {
    id: r.id,
    firstName: r.firstName,
    lastName: r.lastName,
    phone: r.phone,
    notes: r.notes,
    status: r.status,
    contacts: r.contacts ?? [],
    tags: r.tags ?? [],
    createdAt: r.createdAt.toISOString(),
  };
}

export function makeClientsService(repo: ClientsRepo, deps: ClientsDeps) {
  return {
    async create(trainerId: string, input: CreateClientRequest): Promise<ClientResponse> {
      const row = await repo.create({
        clientId: deps.newId(),
        trainerId,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone ?? null,
        notes: input.notes ?? null,
        contacts: input.contacts ?? [],
        tags: input.tags ?? [],
      });
      return toResponse(row);
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
      // exactOptionalPropertyTypes: задаём только определённые поля.
      // phone/notes: null трактуем как «не трогать» (YAGNI — очистка через null позже).
      const repoPatch: UpdateClientInput = {};
      if (patch.firstName !== undefined) repoPatch.firstName = patch.firstName;
      if (patch.lastName !== undefined) repoPatch.lastName = patch.lastName;
      if (patch.phone != null) repoPatch.phone = patch.phone;
      if (patch.notes != null) repoPatch.notes = patch.notes;
      if (patch.status !== undefined) repoPatch.status = patch.status;
      if (patch.contacts !== undefined) repoPatch.contacts = patch.contacts;
      if (patch.tags !== undefined) repoPatch.tags = patch.tags;
      const row = await repo.update(trainerId, clientId, repoPatch);
      if (!row) throw notFound('Клиент не найден');
      return toResponse(row);
    },

    async unlink(trainerId: string, clientId: string): Promise<void> {
      const ok = await repo.unlink(trainerId, clientId);
      if (!ok) throw notFound('Клиент не найден');
    },
  };
}

export type ClientsService = ReturnType<typeof makeClientsService>;
