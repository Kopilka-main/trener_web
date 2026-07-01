import { createHash, randomBytes } from 'node:crypto';
import { AppError } from '../../errors.js';
import type { OAuthRepo } from './oauth.repo.js';
import type { OAuthHttp } from './oauth.http.js';
import type { OAuthProvider, OAuthApp } from './oauth.schema.js';

export type ProviderConfig = { clientId: string; clientSecret: string };

export type OAuthDeps = {
  repo: OAuthRepo;
  http: OAuthHttp;
  redirectBase: string; // без завершающего слэша
  vk: ProviderConfig;
  yandex: ProviderConfig;
  // Колбэки создания сессии нужного контура (реализованы auth/client-auth сервисами).
  createTrainerSession: (trainerId: string) => Promise<{ token: string }>;
  createClientSession: (clientAccountId: string) => Promise<{ token: string }>;
};

export type CallbackInput = {
  code?: string | undefined;
  state?: string | undefined;
  deviceId?: string | undefined;
};
export type CallbackResult = { token: string; app: OAuthApp };

// Профиль, извлечённый из ответа провайдера (унифицированный вид).
type Profile = {
  providerUserId: string;
  email: string | null;
  firstName: string;
  lastName: string;
};

// ── PKCE (VK ID 2.1) ──
// verifier = base64url(random 64 bytes) без '='; challenge = base64url(sha256(verifier)) без '='.
function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function generateVerifier(): string {
  return base64url(randomBytes(64));
}
function generateChallenge(verifier: string): string {
  return base64url(createHash('sha256').update(verifier).digest());
}

// Разбивает display name на имя/фамилию (первое слово — имя, остальное — фамилия).
function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: 'Пользователь', lastName: '' };
  const [firstName, ...rest] = parts;
  return { firstName: firstName ?? 'Пользователь', lastName: rest.join(' ') };
}

// Узкие геттеры полей из unknown-ответа провайдера (без any).
function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}
function str(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return null;
}

export function makeOAuthService(deps: OAuthDeps) {
  const { repo, http, redirectBase } = deps;

  function providerConfig(provider: OAuthProvider): ProviderConfig {
    const cfg = provider === 'vk' ? deps.vk : deps.yandex;
    if (!cfg.clientId || !cfg.clientSecret) {
      throw new AppError(503, 'OAUTH_NOT_CONFIGURED', `Вход через ${provider} не настроен`);
    }
    return cfg;
  }

  function redirectUri(provider: OAuthProvider): string {
    return `${redirectBase}/api/auth/oauth/${provider}/callback`;
  }

  // Строит URL авторизации провайдера, предварительно сохранив одноразовый state.
  async function getAuthUrl(provider: OAuthProvider, app: OAuthApp): Promise<string> {
    const cfg = providerConfig(provider);
    const state = base64url(randomBytes(32));

    if (provider === 'vk') {
      const verifier = generateVerifier();
      await repo.saveState({ state, provider, app, verifier });
      const challenge = generateChallenge(verifier);
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: cfg.clientId,
        redirect_uri: redirectUri('vk'),
        scope: 'email',
        state,
        code_challenge: challenge,
        code_challenge_method: 's256',
      });
      return `https://id.vk.ru/authorize?${params.toString()}`;
    }

    // Яндекс — без PKCE.
    await repo.saveState({ state, provider, app, verifier: null });
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: cfg.clientId,
      redirect_uri: redirectUri('yandex'),
      state,
    });
    return `https://oauth.yandex.ru/authorize?${params.toString()}`;
  }

  // ── Обмен кода на профиль (provider-specific) ──

  async function exchangeYandex(code: string): Promise<Profile> {
    const cfg = providerConfig('yandex');
    const token = asRecord(
      await http.postForm('https://oauth.yandex.ru/token', {
        grant_type: 'authorization_code',
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
      }),
    );
    const accessToken = str(token.access_token);
    if (!accessToken) throw new AppError(502, 'OAUTH_EXCHANGE_FAILED', 'Яндекс: не выдал токен');

    const info = asRecord(
      await http.getJson('https://login.yandex.ru/info?format=json', {
        Authorization: `OAuth ${accessToken}`,
      }),
    );
    const providerUserId = str(info.id);
    if (!providerUserId) throw new AppError(502, 'OAUTH_PROFILE_FAILED', 'Яндекс: нет id профиля');
    const name = str(info.display_name) ?? str(info.real_name) ?? 'Пользователь';
    return { providerUserId, email: str(info.default_email), ...splitName(name) };
  }

  async function exchangeVk(
    code: string,
    state: string,
    deviceId: string,
    verifier: string,
  ): Promise<Profile> {
    const cfg = providerConfig('vk');
    const token = asRecord(
      await http.postForm('https://id.vk.ru/oauth2/auth', {
        grant_type: 'authorization_code',
        code,
        client_id: cfg.clientId,
        redirect_uri: redirectUri('vk'),
        device_id: deviceId,
        code_verifier: verifier,
        state,
      }),
    );
    const accessToken = str(token.access_token);
    if (!accessToken) throw new AppError(502, 'OAUTH_EXCHANGE_FAILED', 'VK: не выдал токен');

    const info = asRecord(
      await http.postForm('https://id.vk.ru/oauth2/user_info', {
        client_id: cfg.clientId,
        access_token: accessToken,
      }),
    );
    const user = asRecord(info.user);
    const providerUserId = str(user.user_id);
    if (!providerUserId) throw new AppError(502, 'OAUTH_PROFILE_FAILED', 'VK: нет id профиля');
    const first = str(user.first_name) ?? '';
    const last = str(user.last_name) ?? '';
    const name = `${first} ${last}`.trim() || 'Пользователь';
    return { providerUserId, email: str(user.email), ...splitName(name) };
  }

  // Находит существующий oauth_account (→ сессия без создания) либо создаёт аккаунт
  // нужного контура + линкует. Контур определяется state.app. Возвращает token+app.
  async function resolveSession(
    provider: OAuthProvider,
    app: OAuthApp,
    profile: Profile,
  ): Promise<CallbackResult> {
    const existing = await repo.findAccount(provider, profile.providerUserId);
    if (existing) {
      if (app === 'client' && existing.clientAccountId) {
        const { token } = await deps.createClientSession(existing.clientAccountId);
        return { token, app };
      }
      if (app === 'trainer' && existing.trainerId) {
        const { token } = await deps.createTrainerSession(existing.trainerId);
        return { token, app };
      }
      // Аккаунт провайдера уже привязан к другому контуру — вход в запрошенный запрещаем.
      throw new AppError(409, 'OAUTH_LINKED_OTHER', 'Аккаунт уже привязан к другому приложению');
    }

    // Нового oauth_account нет. Для email пытаемся привязать к уже существующему
    // аккаунту нужного контура; иначе заводим новый.
    const fakeEmail = `${provider}_${profile.providerUserId}@oauth.fitbond`;
    const email = profile.email ?? fakeEmail;

    if (app === 'client') {
      const clientAccountId =
        (profile.email ? await repo.findClientAccountIdByEmail(email) : null) ??
        (await repo.createClientAccount({
          email,
          firstName: profile.firstName,
          lastName: profile.lastName,
        }));
      await repo.linkAccount({ provider, providerUserId: profile.providerUserId, clientAccountId });
      const { token } = await deps.createClientSession(clientAccountId);
      return { token, app };
    }

    const trainerId =
      (profile.email ? await repo.findTrainerIdByEmail(email) : null) ??
      (await repo.createTrainerAccount({
        email,
        firstName: profile.firstName,
        lastName: profile.lastName,
      }));
    await repo.linkAccount({ provider, providerUserId: profile.providerUserId, trainerId });
    const { token } = await deps.createTrainerSession(trainerId);
    return { token, app };
  }

  async function handleCallback(
    provider: OAuthProvider,
    input: CallbackInput,
  ): Promise<CallbackResult> {
    if (!input.code || !input.state) {
      throw new AppError(400, 'OAUTH_BAD_CALLBACK', 'Отсутствует code или state');
    }
    const stateRow = await repo.popState(input.state);
    if (!stateRow || stateRow.provider !== provider) {
      throw new AppError(400, 'OAUTH_INVALID_STATE', 'Недействительный или просроченный state');
    }
    const app = stateRow.app;

    let profile: Profile;
    if (provider === 'vk') {
      if (!stateRow.verifier) {
        throw new AppError(400, 'OAUTH_INVALID_STATE', 'VK: отсутствует code_verifier');
      }
      profile = await exchangeVk(input.code, input.state, input.deviceId ?? '', stateRow.verifier);
    } else {
      profile = await exchangeYandex(input.code);
    }

    return resolveSession(provider, app, profile);
  }

  return { getAuthUrl, handleCallback };
}

export type OAuthService = ReturnType<typeof makeOAuthService>;
