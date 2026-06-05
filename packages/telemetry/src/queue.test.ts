import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeQueue } from './queue.js';

describe('makeQueue', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('батчит и шлёт через send при flush', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const q = makeQueue<{ n: number }>({ send, maxBatch: 10, max: 100 });
    q.push({ n: 1 });
    q.push({ n: 2 });
    await q.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('flush без элементов не шлёт', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const q = makeQueue<{ n: number }>({ send, maxBatch: 10, max: 100 });
    await q.flush();
    expect(send).not.toHaveBeenCalled();
  });

  it('кап очереди отбрасывает старые при переполнении', () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const q = makeQueue<{ n: number }>({ send, maxBatch: 10, max: 2 });
    q.push({ n: 1 });
    q.push({ n: 2 });
    q.push({ n: 3 });
    expect(q.size()).toBe(2);
  });
});
