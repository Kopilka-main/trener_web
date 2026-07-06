import type { SupportRepo, SupportSource, SupportOwner, SupportDirection } from './support.repo.js';
import type { Mailer } from '../../auth/mailer.js';
import type { TelegramClient } from './telegram.js';

export type SupportServiceDeps = {
  newId: () => string;
  now: () => Date;
  // Email администратора для дубля обращений. Пусто/undefined → письмо не шлётся,
  // обращение только сохраняется в БД.
  supportEmail?: string;
  // Telegram-клиент доставки обращения: одна тема на пользователя (создаём/переиспользуем),
  // фолбэк в общий чат. undefined → в Telegram не шлём.
  telegram?: Pick<TelegramClient, 'createTopic' | 'sendToTopic' | 'sendToGeneral'>;
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
// дублирует письмом администратору. Двусторонняя связь: у каждого пользователя ОДНА тема в
// Telegram — обращение уходит в его существующую тему, а если её нет/она удалена, заводится
// новая (её topicId запоминается). Ответ саппорта из той же темы возвращается 'out'-строкой
// и пушем владельцу. Почта/Telegram — best-effort: их ошибка НЕ роняет запрос, обращение уже
// в БД.
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

      // Одна тема на пользователя: текущая тема владельца = topicId его последнего сообщения.
      const owner: SupportOwner = {
        source: input.source,
        trainerId: input.trainerId ?? null,
        clientAccountId: input.clientAccountId ?? null,
      };
      const current = await repo.findCurrentTopicForOwner(owner);

      // Доставка (best-effort): шлём в существующую тему; если её нет/удалена (пост упал) —
      // создаём новую и шлём в неё; если тему завести нельзя — фолбэк в общий чат. Любая
      // ошибка НЕ роняет запрос — обращение всё равно сохраним ниже (topicId = null).
      const client = deps.telegram;
      let topicId: number | undefined;
      if (client) {
        if (current != null) {
          try {
            await client.sendToTopic(current, body);
            topicId = current;
          } catch {
            // тема удалена/недоступна → создадим новую ниже
          }
        }
        if (topicId === undefined) {
          const t = await client.createTopic(title);
          if (t !== undefined) {
            try {
              await client.sendToTopic(t, body);
              topicId = t;
            } catch {
              // пост в новую тему упал — оставим topicId undefined
            }
          } else {
            try {
              await client.sendToGeneral(body);
            } catch {
              // общий чат тоже недоступен — доставку пропускаем
            }
          }
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
