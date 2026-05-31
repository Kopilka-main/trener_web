import { describe, it, expect } from 'vitest';
import { createClientRequestSchema, updateClientRequestSchema } from './clients.js';

describe('clients schemas', () => {
  it('принимает корректное создание', () => {
    const r = createClientRequestSchema.parse({
      firstName: '  Алина  ',
      lastName: 'Кузнецова',
      phone: '+7900',
      notes: 'новичок',
    });
    expect(r.firstName).toBe('Алина'); // trim
  });

  it('отклоняет пустое имя', () => {
    expect(() => createClientRequestSchema.parse({ firstName: '', lastName: 'X' })).toThrow();
  });

  it('update допускает частичные поля и статус', () => {
    const r = updateClientRequestSchema.parse({ status: 'archived' });
    expect(r.status).toBe('archived');
  });

  it('update отклоняет неизвестный статус', () => {
    expect(() => updateClientRequestSchema.parse({ status: 'deleted' })).toThrow();
  });
});
