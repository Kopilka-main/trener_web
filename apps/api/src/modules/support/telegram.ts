// Клиент Telegram Bot API для двусторонней поддержки. Отдельный интерфейс — как Mailer:
// сервис зависит от абстракции, реализация инъектится модулем. Направления два:
//  - исходящее (notify/sendToTopic) — обращение/ответ уходит в тему (forum topic);
//  - входящее (getUpdates) — long-poll забирает ответы саппорта из тем обратно в приложение.
import { fetch, type Dispatcher } from 'undici';
import { socksDispatcher } from 'fetch-socks';

// Совместимость с сервисом поддержки: ему достаточно notify (создать тему + запостить).
// notify возвращает message_thread_id созданной темы (или undefined при откате/ошибке).
export interface SupportNotifier {
  // title — заголовок темы (forum topic) на обращение; text — тело сообщения.
  // Возвращает id темы (message_thread_id) либо undefined, если тему создать не удалось.
  notify(title: string, text: string): Promise<number | undefined>;
}

// Ответ саппорта из темы Telegram (результат long-poll getUpdates).
export type TelegramReply = {
  updateId: number; // update_id — для сдвига offset (nextOffset = maxUpdateId + 1)
  topicId: number; // message_thread_id темы — ключ роутинга к владельцу обращения
  text: string;
  fromId: number;
  fromName: string;
};

// Полный клиент: notify (совместимость) + sendToTopic (ответ в тему) + getUpdates (приём).
export interface TelegramClient extends SupportNotifier {
  sendToTopic(topicId: number, text: string): Promise<void>;
  getUpdates(offset: number | undefined): Promise<TelegramReply[]>;
}

export type TelegramClientOpts = {
  // База Bot API. По умолчанию https://api.telegram.org; можно указать релей,
  // если api.telegram.org недоступен с сервера.
  apiBase?: string;
  // SOCKS5-прокси (host:port или socks5://host:port) — для обхода блокировки
  // api.telegram.org: запрос уходит через прокси (SSH-туннель на зарубежный VPS).
  socksProxy?: string;
  // Логгер для сбоя доставки (доставка best-effort, но молчать не должна).
  logWarn?: (msg: string) => void;
};

// Разбор адреса SOCKS5-прокси из env: host:port или socks5://host:port.
function parseSocks(v: string): { host: string; port: number } | null {
  const s = v.trim().replace(/^socks5h?:\/\//i, '');
  const idx = s.lastIndexOf(':');
  if (idx <= 0) return null;
  const host = s.slice(0, idx);
  const port = Number(s.slice(idx + 1));
  if (!host || !Number.isInteger(port) || port <= 0) return null;
  return { host, port };
}

type TgResponse<T> = { ok: boolean; description?: string; result?: T };

// Сырое обновление getUpdates: интересует только message с темой и текстом.
type TgUpdate = {
  update_id: number;
  message?: {
    message_thread_id?: number;
    text?: string;
    from?: { id?: number; first_name?: string; last_name?: string; username?: string };
  };
};

// Клиент Telegram-поддержки: на каждое обращение создаётся отдельная тема (forum topic),
// сообщение постится в неё. Если тему создать нельзя (бот не админ / не форум) —
// откатываемся на общий чат. Ответы саппорта в темах забираются long-poll getUpdates.
export function makeTelegramClient(
  botToken: string,
  chatId: string,
  opts: TelegramClientOpts = {},
): TelegramClient {
  const base = opts.apiBase?.trim()
    ? opts.apiBase.trim().replace(/\/+$/, '')
    : 'https://api.telegram.org';
  const socks = opts.socksProxy?.trim() ? parseSocks(opts.socksProxy) : null;
  const dispatcher: Dispatcher | undefined = socks
    ? socksDispatcher({ type: 5, host: socks.host, port: socks.port })
    : undefined;
  // id бота — число до ':' в токене: свои же сообщения из getUpdates игнорируем.
  const botId = Number(botToken.split(':')[0]);

  async function call<T>(method: string, payload: Record<string, unknown>): Promise<TgResponse<T>> {
    const res = await fetch(`${base}/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      ...(dispatcher ? { dispatcher } : {}),
    });
    const json = (await res.json().catch(() => ({ ok: false }))) as TgResponse<T>;
    if (!res.ok || !json.ok) {
      throw new Error(
        `telegram ${method} ${res.status}: ${(json.description ?? '').slice(0, 200)}`,
      );
    }
    return json;
  }

  return {
    async notify(title: string, text: string): Promise<number | undefined> {
      try {
        // Отдельная тема на обращение. Не вышло (нет прав/не форум) → общий чат.
        let threadId: number | undefined;
        try {
          const t = await call<{ message_thread_id?: number }>('createForumTopic', {
            chat_id: chatId,
            name: title.slice(0, 128),
          });
          threadId = t.result?.message_thread_id;
        } catch (e) {
          opts.logWarn?.(`createForumTopic failed, fallback to general chat: ${String(e)}`);
        }
        await call('sendMessage', {
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
          ...(threadId ? { message_thread_id: threadId } : {}),
        });
        return threadId;
      } catch (err) {
        opts.logWarn?.(`support telegram notify failed: ${String(err)}`);
        throw err;
      }
    },

    async sendToTopic(topicId: number, text: string): Promise<void> {
      await call('sendMessage', {
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        message_thread_id: topicId,
      });
    },

    async getUpdates(offset: number | undefined): Promise<TelegramReply[]> {
      const r = await call<TgUpdate[]>('getUpdates', {
        ...(offset !== undefined ? { offset } : {}),
        timeout: 25,
        allowed_updates: ['message'],
      });
      const replies: TelegramReply[] = [];
      for (const u of r.result ?? []) {
        const m = u.message;
        // Только сообщения в теме, с текстом и НЕ от самого бота. Прочее (сервисные
        // сообщения о создании темы, апдейты без темы) игнорируем.
        if (!m || m.message_thread_id === undefined || !m.text) continue;
        const fromId = m.from?.id;
        if (fromId === undefined || fromId === botId) continue;
        const fromName =
          [m.from?.first_name, m.from?.last_name].filter((v) => !!v).join(' ') ||
          m.from?.username ||
          '';
        replies.push({
          updateId: u.update_id,
          topicId: m.message_thread_id,
          text: m.text,
          fromId,
          fromName,
        });
      }
      return replies;
    },
  };
}

// Тонкая обёртка обратной совместимости: сервису поддержки нужен только SupportNotifier.
export function makeTelegramNotifier(
  botToken: string,
  chatId: string,
  opts: TelegramClientOpts = {},
): SupportNotifier {
  return makeTelegramClient(botToken, chatId, opts);
}
