// «Запомнить»: последние клиент/длительность/место/online тренера — подтягиваются
// в новые занятия (общий стор для тренерского и клиентского календаря).
const LAST_PREFS_KEY = 'calendar_last_session_prefs';

export type LastPrefs = {
  remember: boolean;
  clientId: string;
  durationMin: number;
  location: string;
  isOnline: boolean;
};

export const EMPTY_PREFS: LastPrefs = {
  remember: false,
  clientId: '',
  durationMin: 60,
  location: '',
  isOnline: false,
};

export function loadLastPrefs(): LastPrefs {
  try {
    const raw = localStorage.getItem(LAST_PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<LastPrefs>;
      return {
        remember: p.remember === true,
        clientId: typeof p.clientId === 'string' ? p.clientId : '',
        durationMin: typeof p.durationMin === 'number' && p.durationMin > 0 ? p.durationMin : 60,
        location: typeof p.location === 'string' ? p.location : '',
        isOnline: p.isOnline === true,
      };
    }
  } catch {
    /* битый JSON / приватный режим */
  }
  return { ...EMPTY_PREFS };
}

export function saveLastPrefs(p: LastPrefs): void {
  try {
    localStorage.setItem(LAST_PREFS_KEY, JSON.stringify(p));
  } catch {
    /* приватный режим */
  }
}
