// Данные отчёта за период. Собираются в reports.repo, форматируются здесь.
// Разделение намеренное: формат — чистая функция, её можно тестировать без БД.
export type ReportData = {
  growth: {
    newTrainers: number;
    newClientAccounts: number;
    totalTrainers: number;
    totalClientAccounts: number;
    activeTrainers: number;
    activeClients: number;
    linkedPairs: number;
  };
  business: {
    workoutsCompleted: number;
    sessionsCreated: number;
    measurements: number;
    messages: number;
    packages: number;
    packagesSum: number;
  };
  health: {
    errors: number;
    topErrors: { message: string; count: number }[];
    versions: { version: string; platform: string; users: number }[];
  };
  screens: { screen: string; minutes: number; opens: number }[];
};

// Разряды пробелами: 42000 → «42 000». Телеграм моноширинным не рендерит, но
// пробелы всё равно делают числа читаемыми.
export function num(n: number): string {
  const s = Math.round(n).toString();
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ' ';
    out += s[i];
  }
  return out;
}

// Дельта к прошлому периоду: «+12» / «−3» / «=». Показываем только когда есть
// с чем сравнивать (prev !== undefined), иначе строка была бы враньём.
function delta(cur: number, prev?: number): string {
  if (prev === undefined) return '';
  const d = cur - prev;
  if (d === 0) return ' (=)';
  return d > 0 ? ` (+${num(d)})` : ` (−${num(-d)})`;
}

// Обрезка длинных строк (тексты ошибок бывают на километр).
function cut(s: string, max: number): string {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length <= max ? one : `${one.slice(0, max - 1)}…`;
}

/// Текст отчёта для Telegram. Без parse_mode: тексты ошибок содержат <, & и
/// прочие символы, которые в HTML-режиме ломали бы отправку.
export function formatReport(title: string, d: ReportData, prev?: ReportData): string {
  const L: string[] = [`📊 ${title}`, ''];

  L.push('РОСТ');
  L.push(
    `Новые тренеры: ${num(d.growth.newTrainers)}${delta(d.growth.newTrainers, prev?.growth.newTrainers)} · всего ${num(d.growth.totalTrainers)}`,
  );
  L.push(
    `Новые клиенты: ${num(d.growth.newClientAccounts)}${delta(d.growth.newClientAccounts, prev?.growth.newClientAccounts)} · всего ${num(d.growth.totalClientAccounts)}`,
  );
  L.push(
    `Активны: ${num(d.growth.activeTrainers)} тренеров, ${num(d.growth.activeClients)} клиентов`,
  );
  L.push(`Связок тренер—клиент: ${num(d.growth.linkedPairs)}`);
  L.push('');

  L.push('ДЕЙСТВИЯ');
  L.push(
    `Проведено тренировок: ${num(d.business.workoutsCompleted)}${delta(d.business.workoutsCompleted, prev?.business.workoutsCompleted)}`,
  );
  L.push(`Создано занятий: ${num(d.business.sessionsCreated)}`);
  L.push(`Замеров: ${num(d.business.measurements)}`);
  L.push(`Сообщений: ${num(d.business.messages)}`);
  L.push(`Оплат: ${num(d.business.packages)} на ${num(d.business.packagesSum)} ₽`);
  L.push('');

  L.push('ЗДОРОВЬЕ');
  L.push(`Ошибок: ${num(d.health.errors)}${delta(d.health.errors, prev?.health.errors)}`);
  for (const e of d.health.topErrors) {
    L.push(`  • ${cut(e.message, 80)} — ${num(e.count)}`);
  }
  if (d.health.versions.length > 0) {
    const v = d.health.versions
      .map((x) => `${x.version} ${x.platform} — ${num(x.users)}`)
      .join(', ');
    L.push(`Версии: ${v}`);
  }
  L.push('');

  L.push('ЭКРАНЫ');
  if (d.screens.length === 0) {
    L.push('нет данных');
  } else {
    d.screens.forEach((s, i) => {
      L.push(`${i + 1}. ${cut(s.screen, 40)} — ${num(s.minutes)} мин / ${num(s.opens)} заходов`);
    });
  }

  return L.join('\n');
}
