/** Подгруппы по основной группе мышц. Группы без подгрупп здесь отсутствуют. */
export const SUBGROUPS_BY_GROUP: Record<string, string[]> = {
  Грудь: ['Верх', 'Середина', 'Низ'],
  Спина: ['Широчайшие', 'Трапеции/верх', 'Поясница/низ'],
  Ноги: ['Квадрицепс', 'Бицепс бедра', 'Ягодицы', 'Икры'],
  Плечи: ['Передняя дельта', 'Средняя дельта', 'Задняя дельта'],
  Руки: ['Бицепс', 'Трицепс', 'Предплечья'],
  'Пресс/Кор': ['Верх', 'Низ', 'Косые'],
  Корпус: ['Верх', 'Низ', 'Косые'],
};

export function subgroupsFor(group: string): string[] {
  return SUBGROUPS_BY_GROUP[group] ?? [];
}

/** Упорядочить набор подгрупп согласно таксономии группы (неизвестные — в конец). */
export function orderSubgroups(group: string, present: Iterable<string>): string[] {
  const order = SUBGROUPS_BY_GROUP[group] ?? [];
  const set = new Set(present);
  const ordered = order.filter((s) => set.has(s));
  const extras = [...set]
    .filter((s) => !order.includes(s))
    .sort((a, b) => a.localeCompare(b, 'ru'));
  return [...ordered, ...extras];
}
