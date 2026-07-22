// Накопительная метрика: сколько всего сейчас и сколько было на начало периода.
export type TotalRow = { label: string; now: number; was: number };

// Данные отчёта за период. Собираются в reports.repo, форматируются здесь.
// Разделение намеренное: формат — чистая функция, её можно тестировать без БД.
export type ReportData = {
  // Накопительные итоги по базе (Было → Стало).
  totals: TotalRow[];
  growth: {
    newTrainers: number;
    newClientAccounts: number;
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
  // Топ тренеров по числу активных клиентов.
  leaders: { name: string; clients: number }[];
  // Кто зарегистрировался за период и каким способом (email / vk / yandex).
  newTrainers: { name: string; via: string }[];
  // Подключение клиентского приложения: сколько карточек тренера связаны с аккаунтом.
  sync: { name: string; linked: number; total: number }[];
  audience: {
    platforms: { platform: string; users: number }[];
    avgSessionMin: number;
  };
  health: {
    errors: number;
    topErrors: { message: string; count: number }[];
    versions: { version: string; platform: string; users: number }[];
  };
  screens: { screen: string; minutes: number; opens: number }[];
};

// Разряды пробелами: 42000 → «42 000».
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

// Доля в процентах от суммы; при нулевой сумме — 0, без деления на ноль.
function share(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/// Текст отчёта для Telegram. Без parse_mode: тексты ошибок содержат <, & и
/// прочие символы, которые в HTML-режиме ломали бы отправку.
export function formatReport(title: string, d: ReportData, prev?: ReportData): string {
  const L: string[] = [`📊 ${title}`, ''];

  if (d.totals.length > 0) {
    L.push('БАЗА');
    for (const t of d.totals) {
      L.push(`${t.label}: ${num(t.now)}${delta(t.now, t.was)}`);
    }
    L.push('');
  }

  L.push('ЗА ПЕРИОД');
  L.push(
    `Новые тренеры: ${num(d.growth.newTrainers)}${delta(d.growth.newTrainers, prev?.growth.newTrainers)} · клиенты: ${num(d.growth.newClientAccounts)}`,
  );
  L.push(
    `Проведено тренировок: ${num(d.business.workoutsCompleted)}${delta(d.business.workoutsCompleted, prev?.business.workoutsCompleted)}`,
  );
  L.push(`Создано занятий: ${num(d.business.sessionsCreated)}`);
  L.push(`Замеров: ${num(d.business.measurements)} · сообщений: ${num(d.business.messages)}`);
  L.push(`Оплат: ${num(d.business.packages)} на ${num(d.business.packagesSum)} ₽`);
  L.push('');

  if (d.leaders.length > 0) {
    L.push('ЛИДЕРЫ (клиентов у тренера)');
    d.leaders.forEach((x, i) => L.push(`${i + 1}. ${cut(x.name, 40)} — ${num(x.clients)}`));
    L.push('');
  }

  if (d.newTrainers.length > 0) {
    L.push('НОВЫЕ ТРЕНЕРЫ');
    for (const t of d.newTrainers) L.push(`• ${cut(t.name, 40)} — вход через ${t.via}`);
    L.push('');
  }

  if (d.sync.length > 0) {
    L.push('СИНХРОНИЗАЦИЯ КЛИЕНТОВ');
    for (const s of d.sync) L.push(`${cut(s.name, 40)} — ${num(s.linked)}/${num(s.total)}`);
    L.push('');
  }

  L.push('АУДИТОРИЯ');
  const act = d.growth.activeTrainers + d.growth.activeClients;
  L.push(
    `Активны: ${num(d.growth.activeTrainers)} тренеров, ${num(d.growth.activeClients)} клиентов` +
      (act > 0
        ? ` (${share(d.growth.activeTrainers, act)}% / ${share(d.growth.activeClients, act)}%)`
        : ''),
  );
  if (d.audience.platforms.length > 0) {
    const tot = d.audience.platforms.reduce((a, p) => a + p.users, 0);
    L.push(
      `Платформы: ${d.audience.platforms.map((p) => `${p.platform} ${share(p.users, tot)}%`).join(', ')}`,
    );
  }
  L.push(`Средняя сессия: ${d.audience.avgSessionMin.toFixed(1)} мин`);
  L.push(`Связок тренер—клиент: ${num(d.growth.linkedPairs)}`);
  L.push('');

  L.push('ЗДОРОВЬЕ');
  L.push(`Ошибок: ${num(d.health.errors)}${delta(d.health.errors, prev?.health.errors)}`);
  for (const e of d.health.topErrors) L.push(`  • ${cut(e.message, 80)} — ${num(e.count)}`);
  if (d.health.versions.length > 0) {
    L.push(
      `Версии: ${d.health.versions.map((x) => `${x.version} ${x.platform} — ${num(x.users)}`).join(', ')}`,
    );
  }
  L.push('');

  L.push('ЭКРАНЫ');
  if (d.screens.length === 0) {
    L.push('нет данных');
  } else {
    d.screens.forEach((s, i) => {
      const before = prev?.screens.find((p) => p.screen === s.screen);
      const was = before ? ` (было ${num(before.minutes)})` : '';
      L.push(
        `${i + 1}. ${cut(s.screen, 40)} — ${num(s.minutes)} мин / ${num(s.opens)} заходов${was}`,
      );
    });
  }

  return L.join('\n');
}
