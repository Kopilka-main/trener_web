// Доставка обращений поддержки в Telegram через Bot API. Отдельный интерфейс —
// как Mailer: сервис от него зависит, реализация инъектится модулем.

export interface SupportNotifier {
  notify(text: string): Promise<void>;
}

export type TelegramNotifierOpts = {
  // База Bot API. По умолчанию https://api.telegram.org; можно указать релей
  // (напр. зарубежный VPS-прокси), если api.telegram.org недоступен с сервера.
  apiBase?: string;
  // Логгер для сбоя доставки (доставка best-effort, но молчать не должна).
  logWarn?: (msg: string) => void;
};

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
  return {
    async notify(text: string): Promise<void> {
      try {
        const res = await fetch(`${base}/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
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
