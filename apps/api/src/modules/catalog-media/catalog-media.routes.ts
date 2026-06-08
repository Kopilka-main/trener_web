import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { notFound } from '../../errors.js';

// Раздача ГЛОБАЛЬНОГО медиа каталога упражнений (картинки/видео техники).
// Это НЕ приватные пользовательские файлы (те — только через защищённый
// /api/files/:id), а общий read-only контент для всех тренеров и клиентов,
// поэтому раздаётся публично, без auth. Файлы лежат в catalogMediaDir плоско.

// Жёсткая валидация имени: только латиница/цифры/._- ; никаких разделителей и '..'.
const fileParams = z.object({ file: z.string().regex(/^[A-Za-z0-9._-]+$/) });

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
};

export function catalogMediaRoutes(app: FastifyInstance, catalogMediaDir: string): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const root = path.resolve(catalogMediaDir);

  typed.get('/api/catalog-media/:file', { schema: { params: fileParams } }, async (req, reply) => {
    const { file } = req.params;
    const ext = path.extname(file).toLowerCase();
    const mime = MIME[ext];
    if (!mime) throw notFound('Файл не найден');

    // Дополнительный барьер: абсолютный путь обязан оставаться внутри root.
    const abs = path.resolve(root, file);
    if (abs !== path.join(root, file)) throw notFound('Файл не найден');

    let total: number;
    try {
      const info = await stat(abs);
      if (!info.isFile()) throw notFound('Файл не найден');
      total = info.size;
    } catch {
      throw notFound('Файл не найден');
    }

    reply.header('Content-Type', mime);
    // Контент неизменяемый (имя файла стабильно) — агрессивное кэширование.
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    // Байтовая отдача обязательна для <video> на мобильных (особенно iOS Safari):
    // без 206 на Range-запрос видео не проигрывается. Картинкам это не нужно.
    reply.header('Accept-Ranges', 'bytes');

    // Поддержка одного диапазона "bytes=start-end": открытая верхняя граница
    // "bytes=start-" и суффикс "bytes=-N". Множественные диапазоны не нужны.
    const rangeHeader = req.headers.range;
    const m = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null;
    if (m) {
      const startStr = m[1] ?? '';
      const endStr = m[2] ?? '';
      let start: number;
      let end: number;
      if (startStr === '') {
        // Суффиксная форма: последние N байт.
        start = Math.max(0, total - Number(endStr));
        end = total - 1;
      } else {
        start = Number(startStr);
        end = endStr === '' ? total - 1 : Math.min(Number(endStr), total - 1);
      }
      if (start > end || start >= total) {
        reply.header('Content-Range', `bytes */${total}`);
        return reply.code(416).send();
      }
      reply.code(206);
      reply.header('Content-Range', `bytes ${start}-${end}/${total}`);
      reply.header('Content-Length', end - start + 1);
      return reply.send(createReadStream(abs, { start, end }));
    }

    reply.header('Content-Length', total);
    return reply.send(createReadStream(abs));
  });
}
