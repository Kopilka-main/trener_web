import { buildApp } from './app.js';
import { parseEnv } from './env.js';
import { createDb } from './db/client.js';

const env = parseEnv(process.env);
const { db } = createDb(env.DATABASE_URL);

buildApp({
  db,
  cookieSecret: env.COOKIE_SECRET,
  isProd: env.NODE_ENV === 'production',
  uploadsDir: env.UPLOADS_DIR,
})
  .then((app) =>
    app.listen({ port: env.PORT, host: '0.0.0.0' }).then((address) => {
      app.log.info(`[trener-api] ${address}`);
    }),
  )
  .catch((err: unknown) => {
    console.error('Не удалось запустить сервер', err);
    process.exit(1);
  });
