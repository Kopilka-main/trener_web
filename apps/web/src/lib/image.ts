/** Сжать изображение на клиенте: даунскейл до maxSize по большей стороне + JPEG.
 * Возвращает Blob (image/jpeg). Оригинал не сохраняется. */
export async function compressImage(
  file: File,
  opts: { maxSize?: number; quality?: number } = {},
): Promise<Blob> {
  const maxSize = opts.maxSize ?? 512;
  const quality = opts.quality ?? 0.82;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context недоступен');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality),
  );
  if (!blob) throw new Error('не удалось сжать изображение');
  return blob;
}

/** Вырезать квадратную область из изображения и сжать в JPEG outSize×outSize.
 * crop задаётся в исходных пикселях (sx, sy — левый верхний угол, size — сторона).
 * `imageOrientation: from-image` учитывает EXIF-поворот фото с телефона. */
export async function cropImageToSquare(
  file: File,
  crop: { sx: number; sy: number; size: number },
  opts: { outSize?: number; quality?: number } = {},
): Promise<Blob> {
  const outSize = opts.outSize ?? 512;
  const quality = opts.quality ?? 0.82;
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const canvas = document.createElement('canvas');
  canvas.width = outSize;
  canvas.height = outSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context недоступен');
  ctx.drawImage(bitmap, crop.sx, crop.sy, crop.size, crop.size, 0, 0, outSize, outSize);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality),
  );
  if (!blob) throw new Error('не удалось обработать изображение');
  return blob;
}
