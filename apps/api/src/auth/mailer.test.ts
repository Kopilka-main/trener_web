import { describe, it, expect, vi } from 'vitest';
import { makeLogMailer } from './mailer.js';

describe('logMailer', () => {
  it('логирует письмо и резолвится', async () => {
    const log = vi.fn();
    const mailer = makeLogMailer({ info: log });
    await mailer.send({ to: 'a@b.co', subject: 'Hi', text: 'body' });
    expect(log).toHaveBeenCalledOnce();
  });
});
