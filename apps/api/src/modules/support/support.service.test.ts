import { describe, it, expect, vi } from 'vitest';
import type { SupportRepo, SupportMessageRow, SupportOwner } from './support.repo.js';
import type { Mailer, Email } from '../../auth/mailer.js';
import { makeSupportService, type SupportServiceDeps } from './support.service.js';
import type { SupportNotifier } from './telegram.js';

function fakeRepo(over: Partial<SupportRepo> = {}): SupportRepo {
  return {
    insert: vi.fn(() => Promise.resolve()),
    findOwnerByTopicId: vi.fn(() => Promise.resolve(null)),
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

function fakeNotifier(
  notify: (title: string, text: string) => Promise<number | undefined> = () =>
    Promise.resolve(undefined),
): SupportNotifier {
  return { notify: vi.fn(notify) };
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
    const insert = vi.fn(() => Promise.resolve());
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

  it('submit сохраняет telegramTopicId, полученный из notifier.notify', async () => {
    const insert = vi.fn(() => Promise.resolve());
    const notify = vi.fn(() => Promise.resolve(42));
    const svc = makeSupportService(fakeRepo({ insert }), fakeMailer(), {
      ...baseDeps,
      notifier: { notify },
    });

    await svc.submit({ source: 'client', clientAccountId: 'C', text: 'Вопрос' });

    expect(notify).toHaveBeenCalledTimes(1);
    const saved = insert.mock.calls[0]![0] as SupportMessageRow;
    expect(saved.direction).toBe('in');
    expect(saved.telegramTopicId).toBe(42);
    expect(saved.clientAccountId).toBe('C');
  });

  it('обращение сохраняется даже если telegram упал (topicId остаётся null)', async () => {
    const insert = vi.fn(() => Promise.resolve());
    const notify = vi.fn(() => Promise.reject(new Error('tg down')));
    const svc = makeSupportService(fakeRepo({ insert }), fakeMailer(), {
      ...baseDeps,
      notifier: { notify },
    });

    await expect(
      svc.submit({ source: 'trainer', trainerId: 'A', text: 'Hi' }),
    ).resolves.toBeUndefined();

    const saved = insert.mock.calls[0]![0] as SupportMessageRow;
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
    const insert = vi.fn(() => Promise.resolve());
    const send = vi.fn((_email: Email) => Promise.resolve());
    const svc = makeSupportService(fakeRepo({ insert }), { send }, baseDeps);

    await svc.submit({ source: 'trainer', trainerId: 'A', text: 'Тест' });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('ошибка mailer НЕ роняет submit — обращение всё равно сохранено', async () => {
    const insert = vi.fn(() => Promise.resolve());
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

  it('при заданном notifier шлёт уведомление в Telegram с текстом и источником', async () => {
    const notify = vi.fn((_title: string, _text: string) => Promise.resolve(undefined));
    const svc = makeSupportService(fakeRepo(), fakeMailer(), {
      ...baseDeps,
      notifier: fakeNotifier(notify),
    });

    await svc.submit({ source: 'client', clientAccountId: 'C', text: 'Вопрос по оплате' });

    expect(notify).toHaveBeenCalledTimes(1);
    const [title, text] = notify.mock.calls[0]!;
    expect(title).toContain('клиент');
    expect(text).toContain('Вопрос по оплате');
    expect(text).toContain('клиент');
  });

  it('ошибка notifier НЕ роняет submit — обращение всё равно сохранено', async () => {
    const insert = vi.fn(() => Promise.resolve());
    const notify = vi.fn((_title: string, _text: string) => Promise.reject(new Error('tg down')));
    const svc = makeSupportService(fakeRepo({ insert }), fakeMailer(), {
      ...baseDeps,
      notifier: fakeNotifier(notify),
    });

    await expect(
      svc.submit({ source: 'trainer', trainerId: 'A', text: 'Hi' }),
    ).resolves.toBeUndefined();

    expect(insert).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('addAgentReply при известном topicId сохраняет out-строку и возвращает владельца', async () => {
    const owner: SupportOwner = { source: 'client', trainerId: 'T', clientAccountId: 'C' };
    const insert = vi.fn(() => Promise.resolve());
    const svc = makeSupportService(
      fakeRepo({ insert, findOwnerByTopicId: vi.fn(() => Promise.resolve(owner)) }),
      fakeMailer(),
      baseDeps,
    );

    const result = await svc.addAgentReply({ topicId: 7, text: 'Ответ саппорта' });

    expect(result).toEqual(owner);
    expect(insert).toHaveBeenCalledTimes(1);
    const saved = insert.mock.calls[0]![0] as SupportMessageRow;
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
    const insert = vi.fn(() => Promise.resolve());
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
      { id: 'a', direction: 'in', text: 'вопрос', createdAt: new Date(1) },
      { id: 'b', direction: 'out', text: 'ответ', createdAt: new Date(2) },
    ]);
  });

  it('threadForClient делегирует в repo.listForClient по clientAccountId', async () => {
    const listForClient = vi.fn(() =>
      Promise.resolve([row({ id: 'z', clientAccountId: 'C', text: 'привет' })]),
    );
    const svc = makeSupportService(fakeRepo({ listForClient }), fakeMailer(), baseDeps);

    const thread = await svc.threadForClient('C');

    expect(listForClient).toHaveBeenCalledWith('C');
    expect(thread).toEqual([{ id: 'z', direction: 'in', text: 'привет', createdAt: new Date(0) }]);
  });
});
