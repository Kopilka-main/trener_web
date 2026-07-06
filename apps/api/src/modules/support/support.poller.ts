import type { TelegramClient } from './telegram.js';
import type { SupportService } from './support.service.js';
import type { SupportOwner } from './support.repo.js';

export type SupportPollerDeps = {
  // Достаточно getUpdates: поллер только принимает ответы саппорта из тем.
  client: Pick<TelegramClient, 'getUpdates'>;
  service: Pick<SupportService, 'addAgentReply'>;
  // Владелец найден → уведомить его (пуш). Fire-and-forget со стороны поллера.
  onReply: (owner: SupportOwner, text: string) => void;
  logger: (msg: string, err?: unknown) => void;
  // Пауза перед повтором после ошибки (по умолчанию 5с). Не роняем процесс.
  backoffMs?: number;
  // Пауза между короткими опросами, когда новых ответов нет (по умолчанию 2с).
  // Long-poll (getUpdates timeout>0) не проходит через SOCKS-туннель, поэтому
  // опрашиваем коротко (timeout=0) с этой паузой.
  pollIntervalMs?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Фоновый long-poll ответов саппорта из тем Telegram. offset ведём в памяти
// (nextOffset = maxUpdateId + 1); стартуем без offset — Telegram отдаст неподтверждённые.
// Ошибки ловим и делаем backoff, цикл не падает. Возвращает stop().
export function startSupportPoller(deps: SupportPollerDeps): () => void {
  let stopped = false;
  let nextOffset: number | undefined;
  const backoff = deps.backoffMs ?? 5000;
  const pollMs = deps.pollIntervalMs ?? 2000;

  async function loop(): Promise<void> {
    while (!stopped) {
      try {
        const updates = await deps.client.getUpdates(nextOffset);
        let maxId = -1;
        for (const u of updates) {
          if (u.updateId > maxId) maxId = u.updateId;
          try {
            const owner = await deps.service.addAgentReply({ topicId: u.topicId, text: u.text });
            if (owner) deps.onReply(owner, u.text);
          } catch (err) {
            // Битый апдейт не должен зациклить offset — логируем и идём дальше.
            deps.logger('[support-poller] handle reply failed', err);
          }
        }
        // Подтверждаем обработанный батч: следующий getUpdates сдвинет очередь.
        if (maxId >= 0) nextOffset = maxId + 1;
        // Пусто → пауза перед следующим коротким опросом; есть апдейты → сразу
        // за следующей порцией (дренаж без задержки).
        if (!stopped && updates.length === 0) await sleep(pollMs);
      } catch (err) {
        deps.logger('[support-poller] getUpdates failed', err);
        await sleep(backoff);
      }
    }
  }

  void loop();
  return () => {
    stopped = true;
  };
}
