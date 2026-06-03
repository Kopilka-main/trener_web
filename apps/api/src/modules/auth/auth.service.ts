import type { AuthRepo } from './auth.repo.js';
import type {
  LoginRequest,
  RegisterRequest,
  TrainerResponse,
  UpdateTrainerRequest,
} from '@trener/shared';
import { hashPassword, verifyPassword } from '../../auth/password.js';
import { AppError, unauthorized } from '../../errors.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней

export type AuthDeps = { newId: () => string; now: () => Date };

export type Session = { token: string; expiresAt: Date };

function toTrainerResponse(t: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  title: string | null;
  bio: string | null;
  contacts: { type: string; value: string }[];
}): TrainerResponse {
  return {
    id: t.id,
    email: t.email,
    firstName: t.firstName,
    lastName: t.lastName,
    title: t.title,
    bio: t.bio,
    contacts: t.contacts,
  };
}

export function makeAuthService(repo: AuthRepo, deps: AuthDeps) {
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
  };
}

export type AuthService = ReturnType<typeof makeAuthService>;
