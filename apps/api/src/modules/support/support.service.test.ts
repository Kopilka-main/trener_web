import { describe, it, expect, vi } from 'vitest';
import type { SupportRepo, SupportMessageRow, SupportOwner } from './support.repo.js';
import type { Mailer, Email } from '../../auth/mailer.js';
import { makeSupportService, type SupportServiceDeps } from './support.service.js';
import type { TelegramClient } from './telegram.js';

function fakeRepo(over: Partial<SupportRepo> = {}): SupportRepo {
  return {
    insert: vi.fn(() => Promise.resolve()),
    findOwnerByTopicId: vi.fn(() => Promise.resolve(null)),
    findCurrentTopicForOwner: vi.fn(() => Promise.resolve<number | null>(null)),
    listForTrainer: vi.fn(() => Promise.resolve([])),
    listForClient: vi.fn(() => Promise.resolve([])),
    findTrainerContact: vi.fn(() => Promise.resolve(null)),
    findClientContact: vi.fn(() => Promise.resolve(null)),
    ...over,
  };
}

function fakeMailer(send: (email: Email) => Promise<void> = () => Promise.resolve()): Mailer {
  return { send: vi.fn(send) };
}

// Мок Telegram-клиента доставки: createTopic по умолчанию не создаёт тему (undefined),
// все sendTo* успешны. Тесты подменяют нужное поведение через over.
type FakeTelegram = Pick<
  TelegramClient,
  | 'createTopic'
  | 'sendToTopic'
  | 'sendToGeneral'
  | 'sendPhotoToTopic'
  | 'sendDocumentToTopic'
  | 'sendPhotoToGeneral'
  | 'sendDocumentToGeneral'
>;
function fakeTelegram(over: Partial<FakeTelegram> = {}): FakeTelegram {
  return {
    createTopic: vi.fn(() => Promise.resolve<number | undefined>(undefined)),
    sendToTopic: vi.fn(() => Promise.resolve()),
    sendToGeneral: vi.fn(() => Promise.resolve()),
    sendPhotoToTopic: vi.fn(() => Promise.resolve()),
    sendDocumentToTopic: vi.fn(() => Promise.resolve()),
    sendPhotoToGeneral: vi.fn(() => Promise.resolve()),
    sendDocumentToGeneral: vi.fn(() => Promise.resolve()),
    ...over,
  };
}

// Мок хранилища вложений: save возвращает фиктивный storagePath/size, createFile/remove — no-op.
function fakeStore(over: Partial<SupportServiceDeps['store'] & object> = {}) {
  return {
    save: vi.fn(() => Promise.resolve({ storagePath: 'tr/_/f.jpg', sizeBytes: 3 })),
    remove: vi.fn(() => Promise.resolve()),
    createFile: vi.fn(() =>
      Promise.resolve({
        id: 'file1',
        trainerId: 'A',
        clientId: null,
        accountId: null,
        mime: 'image/jpeg',
        sizeBytes: 3,
        storagePath: 'tr/_/f.jpg',
        originalName: 'photo.jpg',
        createdAt: new Date(0),
      }),
    ),
    ...over,
  };
}

const baseDeps: SupportServiceDeps = { newId: () => 'sup1', now: () => new Date(0) };

function row(over: Partial<SupportMessageRow>): SupportMessageRow {
  return {
    id: 'r1',
    source: 'trainer',
    direction: 'in',
    trainerId: null,
    clientAccountId: null,
    telegramTopicId: null,
    email: null,
    name: null,
    text: 'x',
    createdAt: new Date(0),
    ...over,
  };
}

describe('support.service', () => {
  it('submit сохраняет обращение в repo со снимком отправителя и сгенерированным id', async () => {
    const insert = vi.fn((_row: SupportMessageRow) => Promise.resolve());
    const svc = makeSupportService(fakeRepo({ insert }), fakeMailer(), baseDeps);

    await svc.submit({
      source: 'trainer',
      trainerId: 'A',
      email: 'trainer@fitbond.ru',
      name: 'Иван Петров',
      text: 'Не открывается календарь',
    });

    expect(insert).toHaveBeenCalledWith({
      id: 'sup1',
      source: 'trainer',
      direction: 'in',
      trainerId: 'A',
      clientAccountId: null,
      telegramTopicId: null,
      email: 'trainer@fitbond.ru',
      name: 'Иван Петров',
      text: 'Не открывается календарь',
      createdAt: new Date(0),
    });
  });

  it('(а) нет текущей темы → createTopic + sendToTopic(new), topicId сохранён', async () => {
    const insert = vi.fn((_row: SupportMessageRow) => Promise.resolve());
    const tg = fakeTelegram({ createTopic: vi.fn(() => Promise.resolve<number | undefined>(42)) });
    const findCurrentTopicForOwner = vi.fn(() => Promise.resolve<number | null>(null));
    const svc = makeSupportService(fakeRepo({ insert, findCurrentTopicForOwner }), fakeMailer(), {
      ...baseDeps,
      telegram: tg,
    });

    await svc.submit({ source: 'client', clientAccountId: 'C', text: 'Вопрос' });

    // Владелец текущей темы искался по contour клиента.
    expect(findCurrentTopicForOwner).toHaveBeenCalledWith({
      source: 'client',
      trainerId: null,
      clientAccountId: 'C',
    });
    expect(tg.createTopic).toHaveBeenCalledTimes(1);
    expect(tg.sendToTopic).toHaveBeenCalledTimes(1);
    expect(tg.sendToTopic).toHaveBeenCalledWith(42, expect.stringContaining('Вопрос'));
    expect(tg.sendToGeneral).not.toHaveBeenCalled();
    const saved = insert.mock.calls[0]![0];
    expect(saved.direction).toBe('in');
    expect(saved.telegramTopicId).toBe(42);
    expect(saved.clientAccountId).toBe('C');
  });

  it('(б) есть текущая тема → sendToTopic(current) переиспользована, createTopic НЕ вызван', async () => {
    const insert = vi.fn((_row: SupportMessageRow) => Promise.resolve());
    const tg = fakeTelegram();
    const findCurrentTopicForOwner = vi.fn(() => Promise.resolve<number | null>(7));
    const svc = makeSupportService(fakeRepo({ insert, findCurrentTopicForOwner }), fakeMailer(), {
      ...baseDeps,
      telegram: tg,
    });

    await svc.submit({ source: 'trainer', trainerId: 'A', text: 'Ещё вопрос' });

    expect(tg.sendToTopic).toHaveBeenCalledTimes(1);
    expect(tg.sendToTopic).toHaveBeenCalledWith(7, expect.stringContaining('Ещё вопрос'));
    expect(tg.createTopic).not.toHaveBeenCalled();
    expect(tg.sendToGeneral).not.toHaveBeenCalled();
    const saved = insert.mock.calls[0]![0];
    expect(saved.telegramTopicId).toBe(7);
  });

  it('(в) тема удалена (sendToTopic(current) throws) → createTopic(new) + sendToTopic(new)', async () => {
    const insert = vi.fn((_row: SupportMessageRow) => Promise.resolve());
    const sendToTopic = vi
      .fn<TelegramClient['sendToTopic']>()
      .mockRejectedValueOnce(new Error('topic deleted'))
      .mockResolvedValueOnce(undefined);
    const tg = fakeTelegram({
      sendToTopic,
      createTopic: vi.fn(() => Promise.resolve<number | undefined>(99)),
    });
    const findCurrentTopicForOwner = vi.fn(() => Promise.resolve<number | null>(7));
    const svc = makeSupportService(fakeRepo({ insert, findCurrentTopicForOwner }), fakeMailer(), {
      ...baseDeps,
      telegram: tg,
    });

    await svc.submit({ source: 'trainer', trainerId: 'A', text: 'Привет' });

    expect(sendToTopic).toHaveBeenNthCalledWith(1, 7, expect.any(String));
    expect(tg.createTopic).toHaveBeenCalledTimes(1);
    expect(sendToTopic).toHaveBeenNthCalledWith(2, 99, expect.any(String));
    expect(tg.sendToGeneral).not.toHaveBeenCalled();
    const saved = insert.mock.calls[0]![0];
    expect(saved.telegramTopicId).toBe(99);
  });

  it('(г) createTopic вернул undefined → фолбэк sendToGeneral, topicId остаётся null', async () => {
    const insert = vi.fn((_row: SupportMessageRow) => Promise.resolve());
    const tg = fakeTelegram({
      createTopic: vi.fn(() => Promise.resolve<number | undefined>(undefined)),
    });
    const svc = makeSupportService(fakeRepo({ insert }), fakeMailer(), {
      ...baseDeps,
      telegram: tg,
    });

    await svc.submit({ source: 'client', clientAccountId: 'C', text: 'Вопрос по оплате' });

    expect(tg.createTopic).toHaveBeenCalledTimes(1);
    expect(tg.sendToTopic).not.toHaveBeenCalled();
    expect(tg.sendToGeneral).toHaveBeenCalledTimes(1);
    expect(tg.sendToGeneral).toHaveBeenCalledWith(expect.stringContaining('Вопрос по оплате'));
    const saved = insert.mock.calls[0]![0];
    expect(saved.telegramTopicId).toBeNull();
  });

  it('тело сообщения в Telegram содержит текст обращения и источник', async () => {
    const tg = fakeTelegram({ createTopic: vi.fn(() => Promise.resolve<number | undefined>(1)) });
    const svc = makeSupportService(fakeRepo(), fakeMailer(), { ...baseDeps, telegram: tg });

    await svc.submit({ source: 'client', clientAccountId: 'C', text: 'Вопрос по оплате' });

    expect(tg.sendToTopic).toHaveBeenCalledWith(1, expect.stringContaining('Вопрос по оплате'));
    expect(tg.sendToTopic).toHaveBeenCalledWith(1, expect.stringContaining('клиент'));
  });

  it('(д) submit пишет in-строку даже если вся доставка в Telegram упала (topicId null)', async () => {
    // Тема есть, но пост упал (удалена); создать новую нельзя (createTopic → undefined);
    // общий чат тоже недоступен. Все ветви доставки провалились, но обращение сохранено.
    const insert = vi.fn((_row: SupportMessageRow) => Promise.resolve());
    const tg = fakeTelegram({
      createTopic: vi.fn(() => Promise.resolve<number | undefined>(undefined)),
      sendToTopic: vi.fn(() => Promise.reject(new Error('topic deleted'))),
      sendToGeneral: vi.fn(() => Promise.reject(new Error('chat down'))),
    });
    const findCurrentTopicForOwner = vi.fn(() => Promise.resolve<number | null>(5));
    const svc = makeSupportService(fakeRepo({ insert, findCurrentTopicForOwner }), fakeMailer(), {
      ...baseDeps,
      telegram: tg,
    });

    await expect(
      svc.submit({ source: 'trainer', trainerId: 'A', text: 'Hi' }),
    ).resolves.toBeUndefined();

    expect(tg.sendToTopic).toHaveBeenCalledTimes(1);
    expect(tg.createTopic).toHaveBeenCalledTimes(1);
    expect(tg.sendToGeneral).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    const saved = insert.mock.calls[0]![0];
    expect(saved.telegramTopicId).toBeNull();
    expect(saved.direction).toBe('in');
  });

  it('при заданном SUPPORT_EMAIL зовёт mailer.send с текстом обращения и источником', async () => {
    const send = vi.fn((_email: Email) => Promise.resolve());
    const svc = makeSupportService(
      fakeRepo(),
      { send },
      {
        ...baseDeps,
        supportEmail: 'admin@fitbond.ru',
      },
    );

    await svc.submit({
      source: 'client',
      clientAccountId: 'C',
      email: 'client@fitbond.ru',
      name: 'Пётр Клиентов',
      text: 'Вопрос по оплате пакета',
    });

    expect(send).toHaveBeenCalledTimes(1);
    const email = send.mock.calls[0]![0];
    expect(email.to).toBe('admin@fitbond.ru');
    expect(email.subject).toBe('FitBond: обращение в поддержку');
    expect(email.text).toContain('Вопрос по оплате пакета');
    expect(email.text).toContain('клиент');
    expect(email.text).toContain('client@fitbond.ru');
  });

  it('без SUPPORT_EMAIL письмо не шлётся — обращение только сохраняется в БД', async () => {
    const insert = vi.fn((_row: SupportMessageRow) => Promise.resolve());
    const send = vi.fn((_email: Email) => Promise.resolve());
    const svc = makeSupportService(fakeRepo({ insert }), { send }, baseDeps);

    await svc.submit({ source: 'trainer', trainerId: 'A', text: 'Тест' });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('ошибка mailer НЕ роняет submit — обращение всё равно сохранено', async () => {
    const insert = vi.fn((_row: SupportMessageRow) => Promise.resolve());
    const send = vi.fn((_email: Email) => Promise.reject(new Error('smtp down')));
    const svc = makeSupportService(
      fakeRepo({ insert }),
      { send },
      {
        ...baseDeps,
        supportEmail: 'admin@fitbond.ru',
      },
    );

    await expect(
      svc.submit({ source: 'trainer', trainerId: 'A', email: 'a@b.c', name: 'A', text: 'Hi' }),
    ).resolves.toBeUndefined();

    expect(insert).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('addAgentReply при известном topicId сохраняет out-строку и возвращает владельца', async () => {
    const owner: SupportOwner = { source: 'client', trainerId: 'T', clientAccountId: 'C' };
    const insert = vi.fn((_row: SupportMessageRow) => Promise.resolve());
    const svc = makeSupportService(
      fakeRepo({ insert, findOwnerByTopicId: vi.fn(() => Promise.resolve(owner)) }),
      fakeMailer(),
      baseDeps,
    );

    const result = await svc.addAgentReply({ topicId: 7, text: 'Ответ саппорта' });

    expect(result).toEqual(owner);
    expect(insert).toHaveBeenCalledTimes(1);
    const saved = insert.mock.calls[0]![0];
    expect(saved).toMatchObject({
      source: 'client',
      direction: 'out',
      trainerId: 'T',
      clientAccountId: 'C',
      telegramTopicId: 7,
      email: null,
      name: null,
      text: 'Ответ саппорта',
    });
  });

  it('addAgentReply при неизвестном topicId возвращает null и ничего не пишет', async () => {
    const insert = vi.fn((_row: SupportMessageRow) => Promise.resolve());
    const svc = makeSupportService(
      fakeRepo({ insert, findOwnerByTopicId: vi.fn(() => Promise.resolve(null)) }),
      fakeMailer(),
      baseDeps,
    );

    const result = await svc.addAgentReply({ topicId: 99, text: 'Чужая тема' });

    expect(result).toBeNull();
    expect(insert).not.toHaveBeenCalled();
  });

  it('threadForTrainer маппит строки repo в элементы ленты (id/direction/text/createdAt)', async () => {
    const rows = [
      row({ id: 'a', direction: 'in', text: 'вопрос', createdAt: new Date(1) }),
      row({ id: 'b', direction: 'out', text: 'ответ', createdAt: new Date(2) }),
    ];
    const svc = makeSupportService(
      fakeRepo({ listForTrainer: vi.fn(() => Promise.resolve(rows)) }),
      fakeMailer(),
      baseDeps,
    );

    const thread = await svc.threadForTrainer('T');

    expect(thread).toEqual([
      { id: 'a', direction: 'in', text: 'вопрос', attachment: null, createdAt: new Date(1) },
      { id: 'b', direction: 'out', text: 'ответ', attachment: null, createdAt: new Date(2) },
    ]);
  });

  it('threadForClient делегирует в repo.listForClient по clientAccountId', async () => {
    const listForClient = vi.fn(() =>
      Promise.resolve([row({ id: 'z', clientAccountId: 'C', text: 'привет' })]),
    );
    const svc = makeSupportService(fakeRepo({ listForClient }), fakeMailer(), baseDeps);

    const thread = await svc.threadForClient('C');

    expect(listForClient).toHaveBeenCalledWith('C');
    expect(thread).toEqual([
      { id: 'z', direction: 'in', text: 'привет', attachment: null, createdAt: new Date(0) },
    ]);
  });

  it('threadForTrainer маппит attachment-поля строки в объект attachment', async () => {
    const rows = [
      row({
        id: 'p',
        direction: 'in',
        text: '',
        attachmentFileId: 'f1',
        attachmentKind: 'image',
        attachmentName: 'photo.jpg',
      }),
    ];
    const svc = makeSupportService(
      fakeRepo({ listForTrainer: vi.fn(() => Promise.resolve(rows)) }),
      fakeMailer(),
      baseDeps,
    );

    const thread = await svc.threadForTrainer('T');

    expect(thread[0]!.attachment).toEqual({ fileId: 'f1', kind: 'image', name: 'photo.jpg' });
  });

  it('submitAttachment(image): текущая тема есть → sendPhotoToTopic, файл сохранён, запись с attachment', async () => {
    const insert = vi.fn((_row: SupportMessageRow) => Promise.resolve());
    const store = fakeStore();
    const tg = fakeTelegram();
    const findCurrentTopicForOwner = vi.fn(() => Promise.resolve<number | null>(7));
    const svc = makeSupportService(fakeRepo({ insert, findCurrentTopicForOwner }), fakeMailer(), {
      ...baseDeps,
      telegram: tg,
      store,
    });

    await svc.submitAttachment({
      source: 'trainer',
      trainerId: 'A',
      email: 'a@b.c',
      name: 'Иван',
      kind: 'image',
      file: Buffer.from('img'),
      mime: 'image/jpeg',
      filename: 'photo.jpg',
      caption: 'Смотрите',
    });

    // Файл сохранён на диск и в files.
    expect(store.save).toHaveBeenCalledTimes(1);
    expect(store.createFile).toHaveBeenCalledTimes(1);
    // Картинка ушла в существующую тему; документные/general-методы не тронуты.
    expect(tg.sendPhotoToTopic).toHaveBeenCalledTimes(1);
    expect(tg.sendPhotoToTopic).toHaveBeenCalledWith(
      7,
      expect.any(Buffer),
      'photo.jpg',
      expect.stringContaining('Смотрите'),
    );
    expect(tg.createTopic).not.toHaveBeenCalled();
    expect(tg.sendDocumentToTopic).not.toHaveBeenCalled();
    expect(tg.sendPhotoToGeneral).not.toHaveBeenCalled();
    // Запись обращения с attachment-полями.
    const saved = insert.mock.calls[0]![0];
    expect(saved).toMatchObject({
      direction: 'in',
      trainerId: 'A',
      telegramTopicId: 7,
      text: 'Смотрите',
      attachmentFileId: 'sup1',
      attachmentKind: 'image',
      attachmentName: 'photo.jpg',
    });
  });

  it('submitAttachment(file): нет темы → createTopic + sendDocumentToTopic', async () => {
    const insert = vi.fn((_row: SupportMessageRow) => Promise.resolve());
    const store = fakeStore();
    const tg = fakeTelegram({ createTopic: vi.fn(() => Promise.resolve<number | undefined>(42)) });
    const svc = makeSupportService(fakeRepo({ insert }), fakeMailer(), {
      ...baseDeps,
      telegram: tg,
      store,
    });

    await svc.submitAttachment({
      source: 'trainer',
      trainerId: 'A',
      kind: 'file',
      file: Buffer.from('pdf'),
      mime: 'application/pdf',
      filename: 'doc.pdf',
    });

    expect(tg.createTopic).toHaveBeenCalledTimes(1);
    expect(tg.sendDocumentToTopic).toHaveBeenCalledWith(
      42,
      expect.any(Buffer),
      'doc.pdf',
      expect.any(String),
    );
    expect(tg.sendPhotoToTopic).not.toHaveBeenCalled();
    const saved = insert.mock.calls[0]![0];
    expect(saved.telegramTopicId).toBe(42);
    expect(saved.attachmentKind).toBe('file');
    expect(saved.text).toBe('');
  });

  it('submitAttachment: сбой темы (sendPhotoToTopic throws) → фолбэк sendPhotoToGeneral, topicId null', async () => {
    const insert = vi.fn((_row: SupportMessageRow) => Promise.resolve());
    const store = fakeStore();
    const tg = fakeTelegram({
      createTopic: vi.fn(() => Promise.resolve<number | undefined>(undefined)),
      sendPhotoToTopic: vi.fn(() => Promise.reject(new Error('topic gone'))),
    });
    const findCurrentTopicForOwner = vi.fn(() => Promise.resolve<number | null>(5));
    const svc = makeSupportService(fakeRepo({ insert, findCurrentTopicForOwner }), fakeMailer(), {
      ...baseDeps,
      telegram: tg,
      store,
    });

    await svc.submitAttachment({
      source: 'trainer',
      trainerId: 'A',
      kind: 'image',
      file: Buffer.from('img'),
      mime: 'image/jpeg',
      filename: 'p.jpg',
    });

    expect(tg.sendPhotoToTopic).toHaveBeenCalledTimes(1);
    expect(tg.createTopic).toHaveBeenCalledTimes(1);
    expect(tg.sendPhotoToGeneral).toHaveBeenCalledTimes(1);
    const saved = insert.mock.calls[0]![0];
    expect(saved.telegramTopicId).toBeNull();
    expect(saved.attachmentFileId).toBe('sup1');
  });

  it('submitAttachment без store сконфигурированного бросает', async () => {
    const svc = makeSupportService(fakeRepo(), fakeMailer(), baseDeps);
    await expect(
      svc.submitAttachment({
        source: 'trainer',
        trainerId: 'A',
        kind: 'image',
        file: Buffer.from('x'),
        mime: 'image/jpeg',
        filename: 'p.jpg',
      }),
    ).rejects.toThrow();
  });
});
