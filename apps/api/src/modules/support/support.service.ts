import type { SupportRepo, SupportSource, SupportOwner, SupportDirection } from './support.repo.js';
import type { Mailer } from '../../auth/mailer.js';
import type { SupportNotifier } from './telegram.js';

export type SupportServiceDeps = {
  newId: () => string;
  now: () => Date;
  // Email администратора для дубля обращений. Пусто/undefined → письмо не шлётся,
  // обращение только сохраняется в БД.
  supportEmail?: string;
  // Уведомление о новом обращении в Telegram. undefined → в Telegram не шлём.
  notifier?: SupportNotifier;
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

// Ответ саппорта из темы Telegram: topicId связывает его с обращением, text — тело.
export type AddAgentReplyInput = { topicId: number; text: string };

// Элемент ленты переписки для отдачи в приложение (без снимка отправителя/темы).
export type SupportThreadItem = {
  id: string;
  direction: SupportDirection;
  text: string;
  createdAt: Date;
};

const sourceLabel: Record<SupportSource, string> = {
  trainer: 'тренер',
  client: 'клиент',
};

// Сервис поддержки без HTTP: сохраняет обращение в repo и (если задан SUPPORT_EMAIL)
// дублирует письмом администратору. Двусторонняя связь: обращение создаёт тему в Telegram
// (topicId запоминается), ответ саппорта из той же темы возвращается 'out'-строкой и пушем
// владельцу. Почта/Telegram — best-effort: их ошибка НЕ роняет запрос, обращение уже в БД.
export function makeSupportService(repo: SupportRepo, mailer: Mailer, deps: SupportServiceDeps) {
  return {
    async submit(input: SubmitSupportInput): Promise<void> {
      const sender = [input.name, input.email].filter((v) => !!v).join(' ');
      // Заголовок темы (forum topic) на обращение: источник + отправитель.
      const title = `🆘 ${sourceLabel[input.source]} · ${input.name || input.email || 'аноним'}`;
      const body =
        `Источник: ${sourceLabel[input.source]}\n` +
        `Отправитель: ${sender || '—'}\n\n` +
        input.text;

      // Telegram (best-effort): создаём тему и запоминаем её id для роутинга ответов.
      // Ошибка не роняет запрос — обращение всё равно сохраним ниже (topicId = null).
      let topicId: number | undefined;
      if (deps.notifier) {
        try {
          topicId = await deps.notifier.notify(title, body);
        } catch {
          // доставка best-effort
        }
      }

      await repo.insert({
        id: deps.newId(),
        source: input.source,
        direction: 'in',
        trainerId: input.trainerId ?? null,
        clientAccountId: input.clientAccountId ?? null,
        telegramTopicId: topicId ?? null,
        email: input.email ?? null,
        name: input.name ?? null,
        text: input.text,
        createdAt: deps.now(),
      });

      if (!deps.supportEmail) return;

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

    // Ответ саппорта из темы Telegram → 'out'-строка тому же владельцу. Владелец найден
    // (тема наша) → сохраняем и возвращаем владельца (для пуша); не найден (чужая тема) →
    // null (игнор). Снимок отправителя для 'out' пуст — ответ идёт от саппорта, не от юзера.
    async addAgentReply(input: AddAgentReplyInput): Promise<SupportOwner | null> {
      const owner = await repo.findOwnerByTopicId(input.topicId);
      if (!owner) return null;
      await repo.insert({
        id: deps.newId(),
        source: owner.source,
        direction: 'out',
        trainerId: owner.trainerId,
        clientAccountId: owner.clientAccountId,
        telegramTopicId: input.topicId,
        email: null,
        name: null,
        text: input.text,
        createdAt: deps.now(),
      });
      return owner;
    },

    async threadForTrainer(trainerId: string): Promise<SupportThreadItem[]> {
      return (await repo.listForTrainer(trainerId)).map(toThreadItem);
    },

    async threadForClient(clientAccountId: string): Promise<SupportThreadItem[]> {
      return (await repo.listForClient(clientAccountId)).map(toThreadItem);
    },
  };
}

function toThreadItem(r: {
  id: string;
  direction: SupportDirection;
  text: string;
  createdAt: Date;
}): SupportThreadItem {
  return { id: r.id, direction: r.direction, text: r.text, createdAt: r.createdAt };
}

export type SupportService = ReturnType<typeof makeSupportService>;
