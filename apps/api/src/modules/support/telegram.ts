// Клиент Telegram Bot API для двусторонней поддержки. Отдельный интерфейс — как Mailer:
// сервис зависит от абстракции, реализация инъектится модулем. Направления два:
//  - исходящее (createTopic/sendToTopic/sendToGeneral) — обращение/ответ уходит в тему
//    (forum topic) пользователя либо в общий чат (фолбэк, когда темы недоступны);
//  - входящее (getUpdates) — long-poll забирает ответы саппорта из тем обратно в приложение.
import { fetch, FormData, type Dispatcher } from 'undici';
import { Blob } from 'node:buffer';
import { socksDispatcher } from 'fetch-socks';

// Ответ саппорта из темы Telegram (результат long-poll getUpdates).
export type TelegramReply = {
  updateId: number; // update_id — для сдвига offset (nextOffset = maxUpdateId + 1)
  topicId: number; // message_thread_id темы — ключ роутинга к владельцу обращения
  text: string;
  fromId: number;
  fromName: string;
};

// Полный клиент Telegram-поддержки. Доставка разложена на примитивы: тема создаётся один раз
// на пользователя (createTopic), сообщения постятся в неё (sendToTopic); при отказе (тема
// удалена / нет прав) — откат в общий чат (sendToGeneral). getUpdates — приём ответов саппорта.
export interface TelegramClient {
  // Создать тему (forum topic) под заголовком title. Возвращает message_thread_id новой темы
  // либо undefined, если создать не удалось (бот не админ / чат не форум) — сбой логируется.
  createTopic(title: string): Promise<number | undefined>;
  // Пост в тему topicId (message_thread_id). КИДАЕТ при ошибке — сервис трактует это как
  // «тема удалена/недоступна» и заводит новую.
  sendToTopic(topicId: number, text: string): Promise<void>;
  // Пост в общий чат (без message_thread_id) — фолбэк, когда тему создать не удалось.
  sendToGeneral(text: string): Promise<void>;
  // Вложение-картинка в тему topicId (sendPhoto, multipart). КИДАЕТ при ошибке — как
  // sendToTopic (сервис откатится на sendPhotoToGeneral).
  sendPhotoToTopic(
    topicId: number,
    file: Buffer,
    filename: string,
    caption?: string,
  ): Promise<void>;
  // Вложение-документ (любой файл) в тему topicId (sendDocument, multipart). КИДАЕТ при ошибке.
  sendDocumentToTopic(
    topicId: number,
    file: Buffer,
    filename: string,
    caption?: string,
  ): Promise<void>;
  // Фолбэки без темы (общий чат) — когда тему завести/использовать не удалось.
  sendPhotoToGeneral(file: Buffer, filename: string, caption?: string): Promise<void>;
  sendDocumentToGeneral(file: Buffer, filename: string, caption?: string): Promise<void>;
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

// Клиент Telegram-поддержки: одна тема (forum topic) на пользователя, все его обращения
// постятся в неё (createTopic один раз + sendToTopic). Если тему создать нельзя
// (бот не админ / не форум) — откатываемся на общий чат (sendToGeneral). Ответы саппорта
// в темах забираются long-poll getUpdates.
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

  // Multipart-вызов для вложений (sendPhoto/sendDocument): content-type НЕ ставим —
  // FormData сам проставит boundary. fileField — 'photo' или 'document'. КИДАЕТ при ошибке.
  async function callForm(
    method: string,
    fileField: 'photo' | 'document',
    file: Buffer,
    filename: string,
    opts2: { topicId?: number; caption?: string },
  ): Promise<void> {
    const form = new FormData();
    form.append('chat_id', chatId);
    if (opts2.topicId !== undefined) form.append('message_thread_id', String(opts2.topicId));
    if (opts2.caption) form.append('caption', opts2.caption.slice(0, 1024));
    // Buffer → Uint8Array для Blob (undici Blob принимает BlobPart).
    form.append(fileField, new Blob([new Uint8Array(file)]), filename);
    const res = await fetch(`${base}/bot${botToken}/${method}`, {
      method: 'POST',
      body: form,
      ...(dispatcher ? { dispatcher } : {}),
    });
    const json = (await res.json().catch(() => ({ ok: false }))) as TgResponse<unknown>;
    if (!res.ok || !json.ok) {
      throw new Error(
        `telegram ${method} ${res.status}: ${(json.description ?? '').slice(0, 200)}`,
      );
    }
  }

  return {
    // Создать тему (forum topic). undefined, если создать не удалось (нет прав / чат не
    // форум) — сбой логируем, submit не роняем (сервис откатится на общий чат).
    async createTopic(title: string): Promise<number | undefined> {
      try {
        const t = await call<{ message_thread_id?: number }>('createForumTopic', {
          chat_id: chatId,
          name: title.slice(0, 128),
        });
        return t.result?.message_thread_id;
      } catch (e) {
        opts.logWarn?.(`support telegram createForumTopic failed: ${String(e)}`);
        return undefined;
      }
    },

    // Пост в тему. КИДАЕТ при ошибке — сервис трактует сбой как «тема удалена» и заводит новую.
    async sendToTopic(topicId: number, text: string): Promise<void> {
      await call('sendMessage', {
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        message_thread_id: topicId,
      });
    },

    // Пост в общий чат (без message_thread_id) — фолбэк, когда тему создать не удалось.
    async sendToGeneral(text: string): Promise<void> {
      await call('sendMessage', {
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      });
    },

    // Картинка в тему (sendPhoto). КИДАЕТ при ошибке — сервис откатится на general.
    async sendPhotoToTopic(topicId, file, filename, caption): Promise<void> {
      await callForm('sendPhoto', 'photo', file, filename, {
        topicId,
        ...(caption ? { caption } : {}),
      });
    },

    // Документ (любой файл) в тему (sendDocument). КИДАЕТ при ошибке.
    async sendDocumentToTopic(topicId, file, filename, caption): Promise<void> {
      await callForm('sendDocument', 'document', file, filename, {
        topicId,
        ...(caption ? { caption } : {}),
      });
    },

    // Фолбэки без темы (общий чат).
    async sendPhotoToGeneral(file, filename, caption): Promise<void> {
      await callForm('sendPhoto', 'photo', file, filename, { ...(caption ? { caption } : {}) });
    },

    async sendDocumentToGeneral(file, filename, caption): Promise<void> {
      await callForm('sendDocument', 'document', file, filename, {
        ...(caption ? { caption } : {}),
      });
    },

    async getUpdates(offset: number | undefined): Promise<TelegramReply[]> {
      // timeout: 0 (короткий опрос) — long-poll (timeout>0) не проходит через SOCKS-
      // туннель (соединение долго висит → SOCKS establish timeout). Поллер сам делает
      // паузу между короткими запросами.
      const r = await call<TgUpdate[]>('getUpdates', {
        ...(offset !== undefined ? { offset } : {}),
        timeout: 0,
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
