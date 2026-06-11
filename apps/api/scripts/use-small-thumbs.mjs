// Заменяет миниатюры упражнений на скачанные «маленькие превью» (по одному кадру).
// Источник — папка images_small (имена файлов совпадают с оригиналами каталога).
// Копирует <имя>.png → <имя>.small.png в каталог медиа (чтобы НЕ затереть крупное
// фото) и проставляет exercises.thumb_url на новый файл.
//
// Запуск (из корня репо):
//   DATABASE_URL="postgres://postgres:postgres@localhost:5432/trener" \
//     SMALL_DIR="C:/Users/shlya/Desktop/revers/images_small" \
//     node apps/api/scripts/use-small-thumbs.mjs
//
// Идемпотентен: повторный запуск перезапишет файлы и thumb_url.

import { existsSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Нужен DATABASE_URL');
  process.exit(1);
}

const SMALL_DIR = path.resolve(
  process.env.SMALL_DIR ?? 'C:/Users/shlya/Desktop/revers/images_small',
);
// Каталог медиа: в проде — том /data/catalog (CATALOG_MEDIA_DIR), локально — репозиторий.
const MEDIA_DIR = process.env.CATALOG_MEDIA_DIR
  ? path.resolve(process.env.CATALOG_MEDIA_DIR)
  : path.resolve(process.cwd(), 'apps/api/media/catalog');

const sql = postgres(DATABASE_URL);
let updated = 0;
let missing = 0;

try {
  const rows = await sql`
    SELECT id, image_url FROM exercises
    WHERE image_url LIKE '/api/catalog-media/%'
  `;
  for (const row of rows) {
    const fileName = row.image_url.split('/').pop();
    if (!fileName) {
      missing++;
      continue;
    }
    const src = path.join(SMALL_DIR, fileName);
    if (!existsSync(src)) {
      missing++;
      continue; // нет маленькой версии (8 не скачались) — оставляем прежний thumb_url
    }
    const ext = path.extname(fileName); // .png
    const base = fileName.slice(0, -ext.length);
    const smallName = `${base}.small${ext}`;
    copyFileSync(src, path.join(MEDIA_DIR, smallName));
    await sql`UPDATE exercises SET thumb_url = ${`/api/catalog-media/${smallName}`} WHERE id = ${row.id}`;
    updated++;
  }
} finally {
  await sql.end();
}

console.log(`Готово: заменено миниатюр ${updated}, без маленькой версии ${missing}.`);
