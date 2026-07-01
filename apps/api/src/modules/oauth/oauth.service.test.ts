import { describe, it, expect, vi } from 'vitest';
import { makeOAuthService, type OAuthDeps } from './oauth.service.js';
import type { OAuthRepo } from './oauth.repo.js';
import type { OAuthHttp } from './oauth.http.js';

function fakeRepo(over: Partial<Record<keyof OAuthRepo, unknown>> = {}): OAuthRepo {
  return {
    saveState: vi.fn(() => Promise.resolve()),
    popState: vi.fn(() => Promise.resolve(null)),
    findAccount: vi.fn(() => Promise.resolve(null)),
    createTrainerAccount: vi.fn(() => Promise.resolve('new-trainer')),
    createClientAccount: vi.fn(() => Promise.resolve('new-client')),
    findTrainerIdByEmail: vi.fn(() => Promise.resolve(null)),
    findClientAccountIdByEmail: vi.fn(() => Promise.resolve(null)),
    linkAccount: vi.fn(() => Promise.resolve()),
    ...over,
  } as unknown as OAuthRepo;
}

function fakeHttp(over: Partial<OAuthHttp> = {}): OAuthHttp {
  return {
    postForm: vi.fn(() => Promise.resolve({})),
    getJson: vi.fn(() => Promise.resolve({})),
    ...over,
  };
}

type SavedState = { state: string; provider: string; app: string; verifier: string | null };
// Извлекает единственный аргумент первого вызова saveState-мока (без any).
function saveStateArg(mock: unknown): SavedState {
  const calls = (mock as { mock: { calls: unknown[][] } }).mock.calls;
  return calls[0]?.[0] as SavedState;
}

function makeSvc(over: Partial<OAuthDeps> = {}) {
  const deps: OAuthDeps = {
    repo: fakeRepo(),
    http: fakeHttp(),
    redirectBase: 'https://app.fitbond.ru',
    vk: { clientId: 'vk-id', clientSecret: 'vk-secret' },
    yandex: { clientId: 'ya-id', clientSecret: 'ya-secret' },
    createTrainerSession: vi.fn(() => Promise.resolve({ token: 'ttok' })),
    createClientSession: vi.fn(() => Promise.resolve({ token: 'ctok' })),
    ...over,
  };
  return { svc: makeOAuthService(deps), deps };
}

describe('oauth.service getAuthUrl', () => {
  it('vk: URL содержит code_challenge, state и метод s256; state сохранён с verifier', async () => {
    const saveState = vi.fn(() => Promise.resolve());
    const { svc } = makeSvc({ repo: fakeRepo({ saveState }) });
    const url = await svc.getAuthUrl('vk', 'trainer');

    expect(url.startsWith('https://id.vk.ru/authorize?')).toBe(true);
    const q = new URL(url).searchParams;
    expect(q.get('code_challenge')).toBeTruthy();
    expect(q.get('code_challenge_method')).toBe('s256');
    expect(q.get('state')).toBeTruthy();
    expect(q.get('redirect_uri')).toBe('https://app.fitbond.ru/api/auth/oauth/vk/callback');

    const saved = saveStateArg(saveState);
    expect(saved.provider).toBe('vk');
    expect(saved.app).toBe('trainer');
    expect(typeof saved.verifier).toBe('string');
    expect((saved.verifier ?? '').length).toBeGreaterThan(0);
    // state в сохранении совпадает со state в URL.
    expect(saved.state).toBe(q.get('state'));
  });

  it('yandex: без PKCE (verifier=null), корректный redirect_uri', async () => {
    const saveState = vi.fn(() => Promise.resolve());
    const { svc } = makeSvc({ repo: fakeRepo({ saveState }) });
    const url = await svc.getAuthUrl('yandex', 'client');
    expect(url.startsWith('https://oauth.yandex.ru/authorize?')).toBe(true);
    const saved = saveStateArg(saveState);
    expect(saved.verifier).toBeNull();
    expect(saved.app).toBe('client');
  });

  it('провайдер без секретов → 503 OAUTH_NOT_CONFIGURED', async () => {
    const { svc } = makeSvc({ vk: { clientId: '', clientSecret: '' } });
    await expect(svc.getAuthUrl('vk', 'trainer')).rejects.toMatchObject({ status: 503 });
  });
});

describe('oauth.service handleCallback (yandex)', () => {
  const yandexHttp = () =>
    fakeHttp({
      postForm: vi.fn(() => Promise.resolve({ access_token: 'AT' })),
      getJson: vi.fn(() =>
        Promise.resolve({ id: 'ya-42', default_email: 'u@ya.ru', display_name: 'Иван Петров' }),
      ),
    });

  it('существующий oauth_account (trainer) → сессия без создания аккаунта', async () => {
    const createTrainerAccount = vi.fn(() => Promise.resolve('should-not'));
    const linkAccount = vi.fn(() => Promise.resolve());
    const repo = fakeRepo({
      popState: vi.fn(() =>
        Promise.resolve({ state: 's', provider: 'yandex', app: 'trainer', verifier: null }),
      ),
      findAccount: vi.fn(() =>
        Promise.resolve({
          id: 'oa1',
          provider: 'yandex',
          providerUserId: 'ya-42',
          trainerId: 't-existing',
          clientAccountId: null,
        }),
      ),
      createTrainerAccount,
      linkAccount,
    });
    const createTrainerSession = vi.fn(() => Promise.resolve({ token: 'ttok' }));
    const { svc } = makeSvc({ repo, http: yandexHttp(), createTrainerSession });

    const res = await svc.handleCallback('yandex', { code: 'c', state: 's' });
    expect(res).toEqual({ token: 'ttok', app: 'trainer' });
    expect(createTrainerAccount).not.toHaveBeenCalled();
    expect(linkAccount).not.toHaveBeenCalled();
    expect(createTrainerSession).toHaveBeenCalledWith('t-existing');
  });

  it('новый аккаунт (trainer) → создаёт аккаунт + link + сессия', async () => {
    const createTrainerAccount = vi.fn(() => Promise.resolve('t-new'));
    const linkAccount = vi.fn(() => Promise.resolve());
    const repo = fakeRepo({
      popState: vi.fn(() =>
        Promise.resolve({ state: 's', provider: 'yandex', app: 'trainer', verifier: null }),
      ),
      findAccount: vi.fn(() => Promise.resolve(null)),
      findTrainerIdByEmail: vi.fn(() => Promise.resolve(null)),
      createTrainerAccount,
      linkAccount,
    });
    const createTrainerSession = vi.fn(() => Promise.resolve({ token: 'ttok' }));
    const { svc } = makeSvc({ repo, http: yandexHttp(), createTrainerSession });

    const res = await svc.handleCallback('yandex', { code: 'c', state: 's' });
    expect(res).toEqual({ token: 'ttok', app: 'trainer' });
    expect(createTrainerAccount).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'u@ya.ru', firstName: 'Иван', lastName: 'Петров' }),
    );
    expect(linkAccount).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'yandex', providerUserId: 'ya-42', trainerId: 't-new' }),
    );
    expect(createTrainerSession).toHaveBeenCalledWith('t-new');
  });

  it('новый аккаунт (client) → создаёт клиентский аккаунт (не тренерский)', async () => {
    const createClientAccount = vi.fn(() => Promise.resolve('c-new'));
    const createTrainerAccount = vi.fn(() => Promise.resolve('t-should-not'));
    const linkAccount = vi.fn(() => Promise.resolve());
    const repo = fakeRepo({
      popState: vi.fn(() =>
        Promise.resolve({ state: 's', provider: 'yandex', app: 'client', verifier: null }),
      ),
      findAccount: vi.fn(() => Promise.resolve(null)),
      findClientAccountIdByEmail: vi.fn(() => Promise.resolve(null)),
      createClientAccount,
      createTrainerAccount,
      linkAccount,
    });
    const createClientSession = vi.fn(() => Promise.resolve({ token: 'ctok' }));
    const { svc } = makeSvc({ repo, http: yandexHttp(), createClientSession });

    const res = await svc.handleCallback('yandex', { code: 'c', state: 's' });
    expect(res).toEqual({ token: 'ctok', app: 'client' });
    expect(createClientAccount).toHaveBeenCalled();
    expect(createTrainerAccount).not.toHaveBeenCalled();
    expect(linkAccount).toHaveBeenCalledWith(expect.objectContaining({ clientAccountId: 'c-new' }));
    expect(createClientSession).toHaveBeenCalledWith('c-new');
  });

  it('невалидный/просроченный state → 400', async () => {
    const repo = fakeRepo({ popState: vi.fn(() => Promise.resolve(null)) });
    const { svc } = makeSvc({ repo });
    await expect(svc.handleCallback('yandex', { code: 'c', state: 's' })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('state другого провайдера → 400', async () => {
    const repo = fakeRepo({
      popState: vi.fn(() =>
        Promise.resolve({ state: 's', provider: 'vk', app: 'trainer', verifier: 'v' }),
      ),
    });
    const { svc } = makeSvc({ repo });
    await expect(svc.handleCallback('yandex', { code: 'c', state: 's' })).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('oauth.service handleCallback (vk)', () => {
  it('обменивает code через PKCE verifier и возвращает клиентскую сессию', async () => {
    const postForm = vi.fn((url: string, _form: Record<string, string>) => {
      if (url.endsWith('/oauth2/auth')) return Promise.resolve<unknown>({ access_token: 'AT' });
      // user_info
      return Promise.resolve<unknown>({
        user: { user_id: 12345, first_name: 'Пётр', last_name: 'Сидоров', email: 'p@vk.ru' },
      });
    });
    const repo = fakeRepo({
      popState: vi.fn(() =>
        Promise.resolve({ state: 's', provider: 'vk', app: 'client', verifier: 'the-verifier' }),
      ),
      findAccount: vi.fn(() => Promise.resolve(null)),
      findClientAccountIdByEmail: vi.fn(() => Promise.resolve(null)),
      createClientAccount: vi.fn(() => Promise.resolve('c-vk')),
    });
    const createClientSession = vi.fn(() => Promise.resolve({ token: 'ctok' }));
    const { svc } = makeSvc({ repo, http: fakeHttp({ postForm }), createClientSession });

    const res = await svc.handleCallback('vk', { code: 'c', state: 's', deviceId: 'dev-1' });
    expect(res).toEqual({ token: 'ctok', app: 'client' });
    // Первый POST — обмен кода: verifier + device_id переданы.
    const tokenCall = postForm.mock.calls.find((c) => String(c[0]).endsWith('/oauth2/auth'));
    const form = tokenCall![1];
    expect(form.code_verifier).toBe('the-verifier');
    expect(form.device_id).toBe('dev-1');
    expect(createClientSession).toHaveBeenCalledWith('c-vk');
  });

  it('vk без verifier в state → 400', async () => {
    const repo = fakeRepo({
      popState: vi.fn(() =>
        Promise.resolve({ state: 's', provider: 'vk', app: 'trainer', verifier: null }),
      ),
    });
    const { svc } = makeSvc({ repo });
    await expect(
      svc.handleCallback('vk', { code: 'c', state: 's', deviceId: 'd' }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
