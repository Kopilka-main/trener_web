import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import type { ClientLink } from '@trener/shared';
import type { Mailer } from '../../auth/mailer.js';
import { makeSupportRepo } from './support.repo.js';
import { makeSupportService } from './support.service.js';
import { makeTelegramNotifier, type SupportNotifier } from './telegram.js';
import { supportTrainerRoutes, supportClientRoutes } from './support.routes.js';

// Composition root модуля поддержки: собирает repo+service и навешивает ОБА роута —
// тренерский (/api/support) и клиентский (/api/client-app/support). Резолверы контактов
// прокидываем в routes закрытием над repo (граница слоёв routes↔repo сохранена).
export function registerSupportModule(
  app: FastifyInstance,
  deps: {
    db: Db;
    clock: Clock;
    mailer: Mailer;
    resolveScope: (id: string) => Promise<ClientLink>;
    // Email администратора (env SUPPORT_EMAIL). Пусто → обращения только в БД, без письма.
    supportEmail?: string;
    // Telegram-бот саппорта (env TELEGRAM_BOT_TOKEN + TELEGRAM_SUPPORT_CHAT_ID).
    // Оба заданы → дублируем обращение сообщением в чат. apiBase — опциональный
    // релей (TELEGRAM_API_BASE), если api.telegram.org недоступен с сервера.
    telegram?: { botToken: string; chatId: string; apiBase?: string };
  },
): void {
  const repo = makeSupportRepo(deps.db);
  const notifier: SupportNotifier | undefined = deps.telegram
    ? makeTelegramNotifier(deps.telegram.botToken, deps.telegram.chatId, {
        ...(deps.telegram.apiBase ? { apiBase: deps.telegram.apiBase } : {}),
        logWarn: (m) => app.log.warn(m),
      })
    : undefined;
  const svc = makeSupportService(repo, deps.mailer, {
    newId: deps.clock.newId,
    now: deps.clock.now,
    ...(deps.supportEmail ? { supportEmail: deps.supportEmail } : {}),
    ...(notifier ? { notifier } : {}),
  });

  supportTrainerRoutes(app, svc, (id) => repo.findTrainerContact(id));
  supportClientRoutes(app, svc, deps.resolveScope, (id) => repo.findClientContact(id));
}
