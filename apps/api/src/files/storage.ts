import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import path from 'node:path';

// Слой файлового хранилища (чистый fs, без БД). Файлы лежат в
// <uploadsDir>/<trainerId>/<clientId|'_'>/<fileId>.<ext>. storagePath, который
// сохраняется в БД, — ОТНОСИТЕЛЬНЫЙ от uploadsDir (POSIX-разделители).
export type SaveResult = { storagePath: string; sizeBytes: number };

export type Storage = {
  save(
    trainerId: string,
    clientId: string | null,
    fileId: string,
    ext: string,
    data: Buffer,
  ): Promise<SaveResult>;
  openRead(storagePath: string): ReadStream;
  /** Прочитать файл целиком в буфер (для копирования между скоупами). */
  read(storagePath: string): Promise<Buffer>;
  remove(storagePath: string): Promise<void>;
};

function isErrnoException(e: unknown): e is NodeJS.ErrnoException {
  return e instanceof Error && 'code' in e;
}

export function makeStorage(uploadsDir: string): Storage {
  // Резолв относительного storagePath в абсолютный путь на диске.
  function resolve(storagePath: string): string {
    return path.resolve(uploadsDir, storagePath);
  }

  return {
    async save(trainerId, clientId, fileId, ext, data) {
      const sub = clientId ?? '_';
      const dir = path.join(trainerId, sub);
      const fileName = `${fileId}.${ext}`;
      // storagePath в БД — всегда POSIX-разделители для переносимости.
      const storagePath = `${trainerId}/${sub}/${fileName}`;
      await mkdir(path.resolve(uploadsDir, dir), { recursive: true });
      await writeFile(resolve(storagePath), data);
      return { storagePath, sizeBytes: data.byteLength };
    },

    openRead(storagePath) {
      return createReadStream(resolve(storagePath));
    },

    async read(storagePath) {
      return readFile(resolve(storagePath));
    },

    async remove(storagePath) {
      try {
        await unlink(resolve(storagePath));
      } catch (e: unknown) {
        if (isErrnoException(e) && e.code === 'ENOENT') return;
        throw e;
      }
    },
  };
}
