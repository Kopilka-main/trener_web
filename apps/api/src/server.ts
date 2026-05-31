import { buildApp } from './app.js';
import { parseEnv } from './env.js';

const env = parseEnv(process.env);
const app = buildApp();

app
  .listen({ port: env.PORT, host: '0.0.0.0' })
  .then((address) => {
    app.log.info(`[trener-api] ${address}`);
  })
  .catch((err: unknown) => {
    app.log.error({ err }, 'Не удалось запустить сервер');
    process.exit(1);
  });
