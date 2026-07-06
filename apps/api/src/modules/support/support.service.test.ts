import { describe, it, expect, vi } from 'vitest';
import type { SupportRepo } from './support.repo.js';
import type { Mailer, Email } from '../../auth/mailer.js';
import { makeSupportService, type SupportServiceDeps } from './support.service.js';
import type { SupportNotifier } from './telegram.js';

function fakeRepo(over: Partial<SupportRepo> = {}): SupportRepo {
  return {
    insert: vi.fn(() => Promise.resolve()),
    findTrainerContact: vi.fn(() => Promise.resolve(null)),
    findClientContact: vi.fn(() => Promise.resolve(null)),
    ...over,
  };
}

function fakeMailer(send: (email: Email) => Promise<void> = () => Promise.resolve()): Mailer {
  return { send: vi.fn(send) };
}

function fakeNotifier(
  notify: (text: string) => Promise<void> = () => Promise.resolve(),
): SupportNotifier {
  return { notify: vi.fn(notify) };
}

const baseDeps: SupportServiceDeps = { newId: () => 'sup1', now: () => new Date(0) };

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
      trainerId: 'A',
      clientAccountId: null,
      email: 'trainer@fitbond.ru',
      name: 'Иван Петров',
      text: 'Не открывается календарь',
      createdAt: new Date(0),
    });
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
    const notify = vi.fn((_text: string) => Promise.resolve());
    const svc = makeSupportService(fakeRepo(), fakeMailer(), {
      ...baseDeps,
      notifier: fakeNotifier(notify),
    });

    await svc.submit({ source: 'client', clientAccountId: 'C', text: 'Вопрос по оплате' });

    expect(notify).toHaveBeenCalledTimes(1);
    const text = notify.mock.calls[0]![0];
    expect(text).toContain('Вопрос по оплате');
    expect(text).toContain('клиент');
  });

  it('ошибка notifier НЕ роняет submit — обращение всё равно сохранено', async () => {
    const insert = vi.fn(() => Promise.resolve());
    const notify = vi.fn((_text: string) => Promise.reject(new Error('tg down')));
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
});
