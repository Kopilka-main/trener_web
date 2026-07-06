// Доставка обращений поддержки в Telegram через Bot API. Отдельный интерфейс —
// как Mailer: сервис от него зависит, реализация инъектится модулем.
import { fetch, type Dispatcher } from 'undici';
import { socksDispatcher } from 'fetch-socks';

export interface SupportNotifier {
  notify(text: string): Promise<void>;
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

// Отправка сообщения в чат/группу саппорта через Telegram Bot API. Логирует и
// кидает при сбое/не-2xx — вызывающий оборачивает в try/catch (best-effort).
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
  return {
    async notify(text: string): Promise<void> {
      try {
        const res = await fetch(`${base}/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
          ...(dispatcher ? { dispatcher } : {}),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`telegram sendMessage ${res.status}: ${body.slice(0, 200)}`);
        }
      } catch (err) {
        opts.logWarn?.(`support telegram notify failed: ${String(err)}`);
        throw err;
      }
    },
  };
}
