import { describe, it, expect, vi } from 'vitest';
import type { ProgressPhotosRepo, PhotoRow } from './progress-photos.repo.js';
import type { FilesRepo, FileRow } from '../files/files.repo.js';
import type { Storage } from '../../files/storage.js';
import { makeProgressPhotosService, type UploadInput } from './progress-photos.service.js';

function photoRow(over: Partial<PhotoRow> = {}): PhotoRow {
  return {
    id: 'p1',
    trainerId: 'A',
    clientId: 'c1',
    date: '2026-06-01',
    angle: 'front',
    note: null,
    createdAt: new Date(0),
    file: {
      id: 'f1',
      mime: 'image/jpeg',
      sizeBytes: 100,
      originalName: 'p.jpg',
      createdAt: new Date(0),
    },
    ...over,
  };
}

function fileRow(over: Partial<FileRow> = {}): FileRow {
  return {
    id: 'f1',
    trainerId: 'A',
    clientId: 'c1',
    accountId: null,
    mime: 'image/jpeg',
    sizeBytes: 100,
    storagePath: 'A/c1/f1.jpg',
    originalName: 'p.jpg',
    createdAt: new Date(0),
    ...over,
  };
}

function fakeRepo(over: Partial<ProgressPhotosRepo> = {}): ProgressPhotosRepo {
  return {
    create: vi.fn(() => Promise.resolve(photoRow())),
    listForClient: vi.fn(() => Promise.resolve([])),
    getForTrainer: vi.fn(() => Promise.resolve(null)),
    remove: vi.fn(() => Promise.resolve(null)),
    ...over,
  };
}

function fakeFilesRepo(over: Partial<FilesRepo> = {}): FilesRepo {
  return {
    create: vi.fn(() => Promise.resolve(fileRow())),
    getForTrainer: vi.fn(() => Promise.resolve(null)),
    getForAccount: vi.fn(() => Promise.resolve(null)),
    getById: vi.fn(() => Promise.resolve(null)),
    deleteById: vi.fn(() => Promise.resolve(null)),
    delete: vi.fn(() => Promise.resolve(null)),
    ...over,
  };
}

function fakeStorage(over: Partial<Storage> = {}): Storage {
  return {
    save: vi.fn(() => Promise.resolve({ storagePath: 'A/c1/f1.jpg', sizeBytes: 100 })),
    openRead: vi.fn(() => {
      throw new Error('not used');
    }),
    remove: vi.fn(() => Promise.resolve()),
    ...over,
  };
}

const deps = { newId: () => 'newid' };

function uploadInput(over: Partial<UploadInput> = {}): UploadInput {
  return {
    fileBuffer: Buffer.from('img'),
    mime: 'image/jpeg',
    originalName: 'p.jpg',
    date: '2026-06-01',
    angle: 'front',
    note: null,
    ...over,
  };
}

describe('progress-photos.service', () => {
  it('upload: jpeg → ext jpg, storage.save → files.create → photo.create, отдаёт ответ', async () => {
    const save = vi.fn(() => Promise.resolve({ storagePath: 'A/c1/newid.jpg', sizeBytes: 7 }));
    const filesCreate = vi.fn(() => Promise.resolve(fileRow()));
    const photoCreate = vi.fn(() => Promise.resolve(photoRow()));
    const svc = makeProgressPhotosService(
      fakeRepo({ create: photoCreate }),
      fakeFilesRepo({ create: filesCreate }),
      fakeStorage({ save }),
      deps,
    );
    const res = await svc.upload('A', 'c1', uploadInput());
    expect(res.clientId).toBe('c1');
    expect(res.file.mime).toBe('image/jpeg');
    // ext выводится из mime (jpeg → jpg), не из имени файла.
    expect(save).toHaveBeenCalledWith('A', 'c1', 'newid', 'jpg', expect.any(Buffer));
    expect(filesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'newid', mime: 'image/jpeg', storagePath: 'A/c1/newid.jpg' }),
    );
    expect(photoCreate).toHaveBeenCalledWith(
      expect.objectContaining({ trainerId: 'A', clientId: 'c1', fileId: 'newid', angle: 'front' }),
    );
  });

  it('upload: png → ext png; webp → ext webp', async () => {
    const savePng = vi.fn(() => Promise.resolve({ storagePath: 'x', sizeBytes: 1 }));
    await makeProgressPhotosService(
      fakeRepo(),
      fakeFilesRepo(),
      fakeStorage({ save: savePng }),
      deps,
    ).upload('A', 'c1', uploadInput({ mime: 'image/png' }));
    expect(savePng).toHaveBeenCalledWith('A', 'c1', 'newid', 'png', expect.any(Buffer));

    const saveWebp = vi.fn(() => Promise.resolve({ storagePath: 'x', sizeBytes: 1 }));
    await makeProgressPhotosService(
      fakeRepo(),
      fakeFilesRepo(),
      fakeStorage({ save: saveWebp }),
      deps,
    ).upload('A', 'c1', uploadInput({ mime: 'image/webp' }));
    expect(saveWebp).toHaveBeenCalledWith('A', 'c1', 'newid', 'webp', expect.any(Buffer));
  });

  it('upload: неподдерживаемый mime → 400, ничего не сохраняем', async () => {
    const save = vi.fn();
    const svc = makeProgressPhotosService(fakeRepo(), fakeFilesRepo(), fakeStorage({ save }), deps);
    await expect(
      svc.upload('A', 'c1', uploadInput({ mime: 'application/pdf' })),
    ).rejects.toMatchObject({ status: 400, code: 'UNSUPPORTED_MEDIA_TYPE' });
    expect(save).not.toHaveBeenCalled();
  });

  it('upload: падение БД-вставки после записи на диск → откат (storage.remove)', async () => {
    const remove = vi.fn(() => Promise.resolve());
    const filesCreate = vi.fn(() => Promise.reject(new Error('db down')));
    const svc = makeProgressPhotosService(
      fakeRepo(),
      fakeFilesRepo({ create: filesCreate }),
      fakeStorage({
        remove,
        save: vi.fn(() => Promise.resolve({ storagePath: 'A/c1/x.jpg', sizeBytes: 1 })),
      }),
      deps,
    );
    await expect(svc.upload('A', 'c1', uploadInput())).rejects.toThrow('db down');
    expect(remove).toHaveBeenCalledWith('A/c1/x.jpg');
  });

  it('get бросает 404, если repo.getForTrainer → null', async () => {
    const svc = makeProgressPhotosService(fakeRepo(), fakeFilesRepo(), fakeStorage(), deps);
    await expect(svc.get('A', 'c1', 'missing')).rejects.toMatchObject({ status: 404 });
  });

  it('list резолвит ответы', async () => {
    const svc = makeProgressPhotosService(
      fakeRepo({
        listForClient: vi.fn(() => Promise.resolve([photoRow(), photoRow({ id: 'p2' })])),
      }),
      fakeFilesRepo(),
      fakeStorage(),
      deps,
    );
    expect((await svc.list('A', 'c1')).map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('remove: 404 если repo.remove → null; иначе чистит файл с диска', async () => {
    const svc404 = makeProgressPhotosService(fakeRepo(), fakeFilesRepo(), fakeStorage(), deps);
    await expect(svc404.remove('A', 'c1', 'missing')).rejects.toMatchObject({ status: 404 });

    const remove = vi.fn(() => Promise.resolve());
    const svc = makeProgressPhotosService(
      fakeRepo({ remove: vi.fn(() => Promise.resolve({ storagePath: 'A/c1/f1.jpg' })) }),
      fakeFilesRepo(),
      fakeStorage({ remove }),
      deps,
    );
    await expect(svc.remove('A', 'c1', 'p1')).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledWith('A/c1/f1.jpg');
  });
});
