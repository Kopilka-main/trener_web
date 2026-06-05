import { describe, it, expect } from 'vitest';
import { analyticsBatchRequestSchema, clientErrorBatchRequestSchema } from './telemetry.js';

describe('telemetry contracts', () => {
  it('принимает валидный батч событий', () => {
    const r = analyticsBatchRequestSchema.parse({
      source: 'client',
      sessionId: 's1',
      events: [{ name: 'page_view', path: '/workouts', props: { label: 'x' } }],
    });
    expect(r.events).toHaveLength(1);
  });

  it('отклоняет неизвестный source и пустое имя', () => {
    expect(() =>
      analyticsBatchRequestSchema.parse({ source: 'api', sessionId: 's', events: [] }),
    ).toThrow();
    expect(() =>
      analyticsBatchRequestSchema.parse({
        source: 'client',
        sessionId: 's',
        events: [{ name: '' }],
      }),
    ).toThrow();
  });

  it('батч ошибок требует message', () => {
    const r = clientErrorBatchRequestSchema.parse({
      source: 'trainer',
      errors: [{ message: 'boom', stack: 'at x' }],
    });
    expect(r.errors[0]?.message).toBe('boom');
    expect(() => clientErrorBatchRequestSchema.parse({ source: 'client', errors: [{}] })).toThrow();
  });
});
