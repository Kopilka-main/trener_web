import { describe, it, expect, vi } from 'vitest';
import { makeClientScope } from './client-scope.js';

function req(clientAccountId?: string) {
  return { clientAccountId } as never;
}

describe('makeClientScope', () => {
  it('нет clientAccountId → 401', async () => {
    const scope = makeClientScope(vi.fn());
    await expect(scope(req())).rejects.toMatchObject({ status: 401 });
  });

  it('resolveScope вернул null → 409 NOT_LINKED', async () => {
    const scope = makeClientScope(vi.fn(() => Promise.resolve(null)));
    await expect(scope(req('ca1'))).rejects.toMatchObject({ status: 409, code: 'NOT_LINKED' });
  });

  it('привязан → возвращает scope', async () => {
    const scope = makeClientScope(vi.fn(() => Promise.resolve({ trainerId: 't', clientId: 'c' })));
    expect(await scope(req('ca1'))).toEqual({ trainerId: 't', clientId: 'c' });
  });
});
