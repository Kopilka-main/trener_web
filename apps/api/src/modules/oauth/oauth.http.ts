// Тонкий инъектируемый HTTP-клиент для OAuth (обмен кода на токен + профиль).
// Абстракция нужна, чтобы юнит-тесты сервиса мокали сеть без реального fetch.
// Оба метода возвращают распарсенный JSON как unknown — сужение делает сервис.

export type OAuthHttp = {
  // POST application/x-www-form-urlencoded. headers опциональны (VK/Яндекс token/userinfo).
  postForm(
    url: string,
    form: Record<string, string>,
    headers?: Record<string, string>,
  ): Promise<unknown>;
  // GET с произвольными заголовками (Яндекс userinfo: Authorization: OAuth <token>).
  getJson(url: string, headers?: Record<string, string>): Promise<unknown>;
};

// Боевая реализация поверх глобального fetch (Node 18+/undici).
export const realOAuthHttp: OAuthHttp = {
  async postForm(url, form, headers) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
      body: new URLSearchParams(form).toString(),
    });
    return res.json();
  },
  async getJson(url, headers) {
    const res = await fetch(url, { method: 'GET', headers: { ...headers } });
    return res.json();
  },
};
