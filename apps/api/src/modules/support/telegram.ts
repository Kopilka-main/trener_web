// Доставка обращений поддержки в Telegram через Bot API. Отдельный интерфейс —
// как Mailer: сервис от него зависит, реализация инъектится модулем.

export interface SupportNotifier {
  notify(text: string): Promise<void>;
}

// Отправка сообщения в чат/группу саппорта через Telegram Bot API. Кидает при
// не-2xx — вызывающий оборачивает в try/catch (доставка best-effort).
export function makeTelegramNotifier(botToken: string, chatId: string): SupportNotifier {
  return {
    async notify(text: string): Promise<void> {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      });
      if (!res.ok) {
        throw new Error(`telegram sendMessage failed: ${res.status}`);
      }
    },
  };
}
