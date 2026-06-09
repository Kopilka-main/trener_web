// Offline-скрипт: для каждого упражнения каталога с image_url генерирует уменьшенную
// миниатюру (WebP). Если на иллюстрации несколько поз, разделённых вертикальными
// полосами сплошного фона, — вырезает ПЕРВУЮ позу; иначе берёт всю картинку.
// Записывает файл <имя>.thumb.webp рядом в media/catalog и проставляет exercises.thumb_url.
//
// Запуск (из корня репо):
//   DATABASE_URL="postgres://postgres:postgres@localhost:5432/trener" \
//     node apps/api/scripts/crop-thumbs.mjs
//
// Идемпотентен: можно гонять повторно (перезапишет файлы и thumb_url).

import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Нужен DATABASE_URL');
  process.exit(1);
}

// Каталог медиа: в проде — том /data/catalog (CATALOG_MEDIA_DIR), локально — репозиторий.
const MEDIA_DIR = process.env.CATALOG_MEDIA_DIR
  ? path.resolve(process.env.CATALOG_MEDIA_DIR)
  : path.resolve(process.cwd(), 'apps/api/media/catalog');
const ANALYZE_W = 320; // ширина копии для анализа колонок
const BG_TOL = 28; // допуск совпадения с фоном по каналу
const CONTENT_COL = 0.02; // колонка «с контентом», если >2% не-фоновых пикселей
const MIN_RUN_FRAC = 0.06; // минимальная ширина сегмента-позы (доля ширины)
const PAD_FRAC = 0.012; // отступ вокруг сегмента
const THUMB_H = 220; // высота миниатюры, px
const WEBP_Q = 78;

/** Возвращает [x0,x1] первой позы в координатах ОРИГИНАЛА или null (одна поза/не распознано). */
async function firstPoseRange(file, origW, origH) {
  const aw = Math.min(ANALYZE_W, origW);
  const { data, info } = await sharp(file)
    .resize({ width: aw })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels; // 4 (RGBA)
  const at = (x, y, c) => data[(y * w + x) * ch + c];

  const corners = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ];
  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  for (const [cx, cy] of corners) {
    bgR += at(cx, cy, 0);
    bgG += at(cx, cy, 1);
    bgB += at(cx, cy, 2);
  }
  bgR /= 4;
  bgG /= 4;
  bgB /= 4;

  const content = [];
  for (let x = 0; x < w; x++) {
    let nonbg = 0;
    for (let y = 0; y < h; y++) {
      if (at(x, y, 3) < 16) continue;
      if (
        Math.abs(at(x, y, 0) - bgR) > BG_TOL ||
        Math.abs(at(x, y, 1) - bgG) > BG_TOL ||
        Math.abs(at(x, y, 2) - bgB) > BG_TOL
      ) {
        nonbg++;
      }
    }
    content.push(nonbg / h > CONTENT_COL);
  }

  const runs = [];
  let s = -1;
  for (let x = 0; x < w; x++) {
    if (content[x]) {
      if (s < 0) s = x;
    } else if (s >= 0) {
      runs.push([s, x - 1]);
      s = -1;
    }
  }
  if (s >= 0) runs.push([s, w - 1]);

  const minRun = w * MIN_RUN_FRAC;
  const real = runs.filter(([a, b]) => b - a + 1 >= minRun);
  if (real.length < 2) return null;

  const [ra, rb] = real[0];
  const pad = Math.round(w * PAD_FRAC);
  const ax0 = Math.max(0, ra - pad);
  const ax1 = Math.min(w - 1, rb + pad);
  const scaleX = origW / w;
  const x0 = Math.round(ax0 * scaleX);
  const x1 = Math.min(origW, Math.round((ax1 + 1) * scaleX));
  return [x0, x1];
}

const sql = postgres(DATABASE_URL);
let made = 0;
let cropped = 0;
let skipped = 0;

try {
  const rows = await sql`
    SELECT id, image_url FROM exercises
    WHERE image_url LIKE '/api/catalog-media/%'
  `;
  for (const row of rows) {
    const fileName = row.image_url.split('/').pop();
    if (!fileName) {
      skipped++;
      continue;
    }
    const src = path.join(MEDIA_DIR, fileName);
    if (!existsSync(src)) {
      skipped++;
      continue;
    }
    const base = fileName.replace(/\.[^.]+$/, '');
    const thumbName = `${base}.thumb.webp`;
    const dst = path.join(MEDIA_DIR, thumbName);

    try {
      const meta = await sharp(src).metadata();
      const origW = meta.width ?? 0;
      const origH = meta.height ?? 0;
      if (origW === 0 || origH === 0) {
        skipped++;
        continue;
      }

      const range = await firstPoseRange(src, origW, origH);
      let pipe = sharp(src);
      if (range) {
        const [x0, x1] = range;
        const cw = Math.max(1, Math.min(origW - x0, x1 - x0));
        pipe = pipe.extract({ left: x0, top: 0, width: cw, height: origH });
        cropped++;
      }
      await pipe
        .resize({ height: THUMB_H, withoutEnlargement: true })
        .webp({ quality: WEBP_Q })
        .toFile(dst);

      await sql`UPDATE exercises SET thumb_url = ${`/api/catalog-media/${thumbName}`} WHERE id = ${row.id}`;
      made++;
    } catch (e) {
      console.warn(`Пропуск ${fileName}: ${String(e)}`);
      skipped++;
    }
  }
} finally {
  await sql.end();
}

console.log(`Готово: миниатюр ${made} (из них с нарезкой первой позы ${cropped}), пропущено ${skipped}.`);
