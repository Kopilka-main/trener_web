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

  it('по умолчанию contacts и tags — пустые массивы', () => {
    const r = createClientRequestSchema.parse({ firstName: 'А', lastName: 'Б' });
    expect(r.contacts).toEqual([]);
    expect(r.tags).toEqual([]);
  });

  it('принимает contacts и tags', () => {
    const r = createClientRequestSchema.parse({
      firstName: 'А',
      lastName: 'Б',
      contacts: [{ type: 'Телефон', value: '  +7900  ' }],
      tags: ['  vip  ', 'набор'],
    });
    expect(r.contacts).toEqual([{ type: 'Телефон', value: '+7900' }]);
    expect(r.tags).toEqual(['vip', 'набор']);
  });

  it('отклоняет контакт с пустым значением', () => {
    expect(() =>
      createClientRequestSchema.parse({
        firstName: 'А',
        lastName: 'Б',
        contacts: [{ type: 'Телефон', value: '' }],
      }),
    ).toThrow();
  });

  it('update принимает contacts и tags', () => {
    const r = updateClientRequestSchema.parse({ tags: ['x'], contacts: [] });
    expect(r.tags).toEqual(['x']);
    expect(r.contacts).toEqual([]);
  });

  it('update допускает частичные поля и статус', () => {
    const r = updateClientRequestSchema.parse({ status: 'archived' });
    expect(r.status).toBe('archived');
  });

  it('update отклоняет неизвестный статус', () => {
    expect(() => updateClientRequestSchema.parse({ status: 'deleted' })).toThrow();
  });
});
