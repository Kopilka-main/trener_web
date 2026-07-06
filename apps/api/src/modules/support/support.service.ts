import type { SupportRepo, SupportSource } from './support.repo.js';
import type { Mailer } from '../../auth/mailer.js';

export type SupportServiceDeps = {
  newId: () => string;
  now: () => Date;
  // Email администратора для дубля обращений. Пусто/undefined → письмо не шлётся,
  // обращение только сохраняется в БД.
  supportEmail?: string;
};

export type SubmitSupportInput = {
  source: SupportSource;
  trainerId?: string | null;
  clientAccountId?: string | null;
  // Снимок отправителя (email/имя) на момент обращения; оба опциональны.
  email?: string | null;
  name?: string | null;
  text: string;
};

const sourceLabel: Record<SupportSource, string> = {
  trainer: 'тренер',
  client: 'клиент',
};

// Сервис поддержки без HTTP: сохраняет обращение в repo и (если задан SUPPORT_EMAIL)
// дублирует письмом администратору. Почта — best-effort: её ошибка НЕ роняет запрос,
// обращение уже сохранено в БД.
export function makeSupportService(repo: SupportRepo, mailer: Mailer, deps: SupportServiceDeps) {
  return {
    async submit(input: SubmitSupportInput): Promise<void> {
      await repo.insert({
        id: deps.newId(),
        source: input.source,
        trainerId: input.trainerId ?? null,
        clientAccountId: input.clientAccountId ?? null,
        email: input.email ?? null,
        name: input.name ?? null,
        text: input.text,
        createdAt: deps.now(),
      });

      if (!deps.supportEmail) return;

      const sender = [input.name, input.email].filter((v) => !!v).join(' ');
      const body =
        `Источник: ${sourceLabel[input.source]}\n` +
        `Отправитель: ${sender || '—'}\n\n` +
        input.text;

      try {
        await mailer.send({
          to: deps.supportEmail,
          subject: 'FitBond: обращение в поддержку',
          text: body,
        });
      } catch {
        // Почта необязательна: обращение уже сохранено, ошибку SMTP проглатываем.
      }
    },
  };
}

export type SupportService = ReturnType<typeof makeSupportService>;
