import { buildApp } from './app.js';
import { parseEnv } from './env.js';
import { createDb } from './db/client.js';
import { realClock } from './core/app-deps.js';
import { makeStorage } from './files/storage.js';
import { startRemindersScheduler } from './modules/reminders/reminders.scheduler.js';

const env = parseEnv(process.env);
const { db } = createDb(env.DATABASE_URL);

buildApp({
  db,
  cookieSecret: env.COOKIE_SECRET,
  isProd: env.NODE_ENV === 'production',
  uploadsDir: env.UPLOADS_DIR,
  catalogMediaDir: env.CATALOG_MEDIA_DIR,
  vapid: {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT,
  },
  oauth: {
    redirectBase: env.OAUTH_REDIRECT_BASE,
    vk: { clientId: env.VK_CLIENT_ID, clientSecret: env.VK_CLIENT_SECRET },
    yandex: { clientId: env.YANDEX_CLIENT_ID, clientSecret: env.YANDEX_CLIENT_SECRET },
  },
})
  .then((app) =>
    app.listen({ port: env.PORT, host: '0.0.0.0' }).then((address) => {
      app.log.info(`[trener-api] ${address}`);
      // Планировщик напоминаний (скоро занятие, пакет, нет занятий, день рождения).
      startRemindersScheduler({
        db,
        push: app.pushService,
        storage: makeStorage(env.UPLOADS_DIR),
        newId: realClock.newId,
        now: realClock.now,
        log: (msg, err) => {
          app.log.error({ err }, msg);
        },
      });
    }),
  )
  .catch((err: unknown) => {
    console.error('Не удалось запустить сервер', err);
    process.exit(1);
  });
