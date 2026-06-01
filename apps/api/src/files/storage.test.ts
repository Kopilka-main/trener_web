import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { makeStorage } from './storage.js';

async function readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

describe('storage (unit)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'trener-storage-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('save возвращает относительный путь и размер; openRead отдаёт те же байты', async () => {
    const storage = makeStorage(dir);
    const data = Buffer.from('hello мир', 'utf8');

    const res = await storage.save('tr1', 'c1', 'f1', 'png', data);
    expect(res.storagePath).toBe('tr1/c1/f1.png');
    expect(res.sizeBytes).toBe(data.byteLength);

    // Файл реально на диске по ожидаемому пути.
    const onDisk = await readFile(path.join(dir, 'tr1', 'c1', 'f1.png'));
    expect(onDisk.equals(data)).toBe(true);

    const streamed = await readStream(storage.openRead(res.storagePath));
    expect(streamed.equals(data)).toBe(true);
  });

  it('save с clientId=null кладёт файл в каталог "_"', async () => {
    const storage = makeStorage(dir);
    const data = Buffer.from([1, 2, 3, 4]);

    const res = await storage.save('tr1', null, 'f2', 'bin', data);
    expect(res.storagePath).toBe('tr1/_/f2.bin');

    const streamed = await readStream(storage.openRead(res.storagePath));
    expect(streamed.equals(data)).toBe(true);
  });

  it('remove удаляет файл; повторный remove (ENOENT) не бросает', async () => {
    const storage = makeStorage(dir);
    const res = await storage.save('tr1', 'c1', 'f3', 'png', Buffer.from('x'));

    await storage.remove(res.storagePath);
    await expect(readFile(path.join(dir, res.storagePath))).rejects.toThrow();

    // ENOENT игнорируется.
    await expect(storage.remove(res.storagePath)).resolves.toBeUndefined();
  });
});
