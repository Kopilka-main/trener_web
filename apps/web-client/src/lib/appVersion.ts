// Версия загруженного кода (встроена при сборке). Сверяется с /version.json.
const MY_VERSION = __APP_BUILD_ID__;

/**
 * Следит за выходом новой версии: периодически и при возврате на вкладку тянет
 * /version.json (мимо кэша) и сравнивает со своей версией. onUpdate вызывается
 * один раз, когда обнаружена новая версия. Возвращает функцию остановки.
 */
export function startUpdateWatcher(onUpdate: () => void): () => void {
  let done = false;

  async function check(): Promise<void> {
    if (done) return;
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { version?: string };
      if (data.version && data.version !== MY_VERSION) {
        done = true;
        onUpdate();
      }
    } catch {
      // оффлайн/сетевые ошибки — попробуем при следующей проверке
    }
  }

  const iv = window.setInterval(() => void check(), 60_000);
  const onVisible = () => {
    if (document.visibilityState === 'visible') void check();
  };
  document.addEventListener('visibilitychange', onVisible);
  void check();

  return () => {
    window.clearInterval(iv);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
