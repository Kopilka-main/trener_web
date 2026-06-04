import { describe, it, expect, vi } from 'vitest';
import type { MedicalRepo, MedicalRow } from './medical.repo.js';
import type { FilesRepo, FileRow } from '../files/files.repo.js';
import type { Storage } from '../../files/storage.js';
import {
  makeMedicalService,
  type CreateMedicalInput,
  type MedicalFileInput,
} from './medical.service.js';

function medicalRow(over: Partial<MedicalRow> = {}): MedicalRow {
  return {
    id: 'm1',
    trainerId: 'A',
    clientId: 'c1',
    date: '2026-06-01',
    note: 'аллергия',
    createdAt: new Date(0),
    file: null,
    ...over,
  };
}

function fileRow(over: Partial<FileRow> = {}): FileRow {
  return {
    id: 'f1',
    trainerId: 'A',
    clientId: 'c1',
    accountId: null,
    mime: 'application/pdf',
    sizeBytes: 100,
    storagePath: 'A/c1/f1.pdf',
    originalName: 'doc.pdf',
    createdAt: new Date(0),
    ...over,
  };
}

function fakeRepo(over: Partial<MedicalRepo> = {}): MedicalRepo {
  return {
    create: vi.fn(() => Promise.resolve(medicalRow())),
    listForClient: vi.fn(() => Promise.resolve([])),
    getForTrainer: vi.fn(() => Promise.resolve(null)),
    update: vi.fn(() => Promise.resolve(null)),
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
    save: vi.fn(() => Promise.resolve({ storagePath: 'A/c1/f1.pdf', sizeBytes: 100 })),
    openRead: vi.fn(() => {
      throw new Error('not used');
    }),
    remove: vi.fn(() => Promise.resolve()),
    ...over,
  };
}

const deps = { newId: () => 'newid' };

function fileInput(over: Partial<MedicalFileInput> = {}): MedicalFileInput {
  return { buffer: Buffer.from('pdf'), mime: 'application/pdf', originalName: 'doc.pdf', ...over };
}

function createInput(over: Partial<CreateMedicalInput> = {}): CreateMedicalInput {
  return { date: '2026-06-01', note: 'аллергия', ...over };
}

describe('medical.service', () => {
  it('create без файла: storage не трогаем, fileId null', async () => {
    const save = vi.fn();
    const recordCreate = vi.fn(() => Promise.resolve(medicalRow()));
    const svc = makeMedicalService(
      fakeRepo({ create: recordCreate }),
      fakeFilesRepo(),
      fakeStorage({ save }),
      deps,
    );
    const res = await svc.create('A', 'c1', createInput());
    expect(res.file).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(recordCreate).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: null, note: 'аллергия' }),
    );
  });

  it('create с pdf-файлом: ext pdf, storage.save → files.create → record.create', async () => {
    const save = vi.fn(() => Promise.resolve({ storagePath: 'A/c1/newid.pdf', sizeBytes: 7 }));
    const filesCreate = vi.fn(() => Promise.resolve(fileRow()));
    const recordCreate = vi.fn(() =>
      Promise.resolve(
        medicalRow({
          file: {
            id: 'newid',
            mime: 'application/pdf',
            sizeBytes: 7,
            originalName: 'doc.pdf',
            createdAt: new Date(0),
          },
        }),
      ),
    );
    const svc = makeMedicalService(
      fakeRepo({ create: recordCreate }),
      fakeFilesRepo({ create: filesCreate }),
      fakeStorage({ save }),
      deps,
    );
    const res = await svc.create('A', 'c1', createInput({ file: fileInput() }));
    expect(save).toHaveBeenCalledWith('A', 'c1', 'newid', 'pdf', expect.any(Buffer));
    expect(filesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'newid', mime: 'application/pdf' }),
    );
    expect(recordCreate).toHaveBeenCalledWith(expect.objectContaining({ fileId: 'newid' }));
    expect(res.file?.mime).toBe('application/pdf');
  });

  it('create: изображения тоже допустимы (image/png → png)', async () => {
    const save = vi.fn(() => Promise.resolve({ storagePath: 'x', sizeBytes: 1 }));
    await makeMedicalService(fakeRepo(), fakeFilesRepo(), fakeStorage({ save }), deps).create(
      'A',
      'c1',
      createInput({ file: fileInput({ mime: 'image/png' }) }),
    );
    expect(save).toHaveBeenCalledWith('A', 'c1', 'newid', 'png', expect.any(Buffer));
  });

  it('create: неподдерживаемый mime → 400, ничего не сохраняем', async () => {
    const save = vi.fn();
    const svc = makeMedicalService(fakeRepo(), fakeFilesRepo(), fakeStorage({ save }), deps);
    await expect(
      svc.create('A', 'c1', createInput({ file: fileInput({ mime: 'application/zip' }) })),
    ).rejects.toMatchObject({ status: 400, code: 'UNSUPPORTED_MEDIA_TYPE' });
    expect(save).not.toHaveBeenCalled();
  });

  it('create: падение files.create после записи на диск → откат (storage.remove)', async () => {
    const remove = vi.fn(() => Promise.resolve());
    const filesCreate = vi.fn(() => Promise.reject(new Error('db down')));
    const svc = makeMedicalService(
      fakeRepo(),
      fakeFilesRepo({ create: filesCreate }),
      fakeStorage({
        remove,
        save: vi.fn(() => Promise.resolve({ storagePath: 'A/c1/x.pdf', sizeBytes: 1 })),
      }),
      deps,
    );
    await expect(svc.create('A', 'c1', createInput({ file: fileInput() }))).rejects.toThrow(
      'db down',
    );
    expect(remove).toHaveBeenCalledWith('A/c1/x.pdf');
  });

  it('get бросает 404, если repo.getForTrainer → null', async () => {
    const svc = makeMedicalService(fakeRepo(), fakeFilesRepo(), fakeStorage(), deps);
    await expect(svc.get('A', 'c1', 'missing')).rejects.toMatchObject({ status: 404 });
  });

  it('list резолвит ответы (file nullable)', async () => {
    const svc = makeMedicalService(
      fakeRepo({
        listForClient: vi.fn(() =>
          Promise.resolve([medicalRow(), medicalRow({ id: 'm2', file: null })]),
        ),
      }),
      fakeFilesRepo(),
      fakeStorage(),
      deps,
    );
    const list = await svc.list('A', 'c1');
    expect(list.map((r) => r.id)).toEqual(['m1', 'm2']);
    expect(list[1]?.file).toBeNull();
  });

  it('update: 404 если repo.update → null; иначе отдаёт обновлённую запись', async () => {
    const svc404 = makeMedicalService(fakeRepo(), fakeFilesRepo(), fakeStorage(), deps);
    await expect(svc404.update('A', 'c1', 'missing', { note: 'x' })).rejects.toMatchObject({
      status: 404,
    });

    const svc = makeMedicalService(
      fakeRepo({ update: vi.fn(() => Promise.resolve(medicalRow({ note: 'обновлено' }))) }),
      fakeFilesRepo(),
      fakeStorage(),
      deps,
    );
    const res = await svc.update('A', 'c1', 'm1', { note: 'обновлено' });
    expect(res.note).toBe('обновлено');
  });

  it('remove: 404 если repo.remove → null', async () => {
    const svc = makeMedicalService(fakeRepo(), fakeFilesRepo(), fakeStorage(), deps);
    await expect(svc.remove('A', 'c1', 'missing')).rejects.toMatchObject({ status: 404 });
  });

  it('remove: запись без файла → storage.remove НЕ вызывается', async () => {
    const remove = vi.fn(() => Promise.resolve());
    const svc = makeMedicalService(
      fakeRepo({ remove: vi.fn(() => Promise.resolve({ storagePath: null })) }),
      fakeFilesRepo(),
      fakeStorage({ remove }),
      deps,
    );
    await svc.remove('A', 'c1', 'm1');
    expect(remove).not.toHaveBeenCalled();
  });

  it('remove: запись с файлом → чистит файл с диска', async () => {
    const remove = vi.fn(() => Promise.resolve());
    const svc = makeMedicalService(
      fakeRepo({ remove: vi.fn(() => Promise.resolve({ storagePath: 'A/c1/f1.pdf' })) }),
      fakeFilesRepo(),
      fakeStorage({ remove }),
      deps,
    );
    await svc.remove('A', 'c1', 'm1');
    expect(remove).toHaveBeenCalledWith('A/c1/f1.pdf');
  });
});
