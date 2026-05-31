import { randomUUID } from 'node:crypto';

// Общие зависимости-провайдеры для доменных модулей (детерминизм в тестах).
export type Clock = { newId: () => string; now: () => Date };

export const realClock: Clock = {
  newId: () => randomUUID(),
  now: () => new Date(),
};
