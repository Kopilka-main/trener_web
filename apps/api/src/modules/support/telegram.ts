// Доставка обращений поддержки в Telegram через Bot API. Отдельный интерфейс —
// как Mailer: сервис от него зависит, реализация инъектится модулем.
import { fetch, type Dispatcher } from 'undici';
import { socksDispatcher } from 'fetch-socks';

export interface SupportNotifier {
  // title — заголовок темы (forum topic) на обращение; text — тело сообщения.
  notify(title: string, text: string): Promise<void>;
}

export type TelegramNotifierOpts = {
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

type TgResult = { ok: boolean; description?: string; result?: { message_thread_id?: number } };

// Отправка обращений в Telegram: на каждое создаётся отдельная тема (forum topic),
// сообщение постится в неё. Если тему создать нельзя (бот не админ / не форум) —
// откатываемся на общий чат. Логирует и кидает при сбое (вызывающий — best-effort).
export function makeTelegramNotifier(
  botToken: string,
  chatId: string,
  opts: TelegramNotifierOpts = {},
): SupportNotifier {
  const base = opts.apiBase?.trim()
    ? opts.apiBase.trim().replace(/\/+$/, '')
    : 'https://api.telegram.org';
  const socks = opts.socksProxy?.trim() ? parseSocks(opts.socksProxy) : null;
  const dispatcher: Dispatcher | undefined = socks
    ? socksDispatcher({ type: 5, host: socks.host, port: socks.port })
    : undefined;

  async function call(method: string, payload: Record<string, unknown>): Promise<TgResult> {
    const res = await fetch(`${base}/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      ...(dispatcher ? { dispatcher } : {}),
    });
    const json = (await res.json().catch(() => ({ ok: false }))) as TgResult;
    if (!res.ok || !json.ok) {
      throw new Error(
        `telegram ${method} ${res.status}: ${(json.description ?? '').slice(0, 200)}`,
      );
    }
    return json;
  }

  return {
    async notify(title: string, text: string): Promise<void> {
      try {
        // Отдельная тема на обращение. Не вышло (нет прав/не форум) → общий чат.
        let threadId: number | undefined;
        try {
          const t = await call('createForumTopic', { chat_id: chatId, name: title.slice(0, 128) });
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
      } catch (err) {
        opts.logWarn?.(`support telegram notify failed: ${String(err)}`);
        throw err;
      }
    },
  };
}
