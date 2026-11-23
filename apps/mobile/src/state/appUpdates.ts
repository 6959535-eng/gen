import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { checkApk, fetchOtaUpdate, serverBase, type ApkInfo } from '../services/appUpdates';
import { useData } from './AppProvider';

const OTA_EVERY_MS = 60 * 60_000; // не частіше разу на годину при поверненні в додаток
const APK_EVERY_MS = 6 * 60 * 60_000;

/**
 * Стан оновлень для банера на головній:
 *  otaReady — OTA завантажено, застосується при перезапуску (або кнопкою);
 *  apk — доступна новіша версія APK.
 */
export function useAppUpdates() {
  const serverUrl = useData((r) => r.local.get('server_url') || null);
  const base = serverBase(serverUrl);
  const [otaReady, setOtaReady] = useState(false);
  const [apk, setApk] = useState<ApkInfo | null>(null);
  const last = useRef({ ota: 0, apk: 0 });

  const run = useCallback(async (force = false) => {
    const now = Date.now();
    if (force || now - last.current.ota > OTA_EVERY_MS) {
      last.current.ota = now;
      try {
        if (await fetchOtaUpdate()) setOtaReady(true);
      } catch {
        /* немає мережі / сервер недоступний — спробуємо пізніше */
      }
    }
    if (force || now - last.current.apk > APK_EVERY_MS) {
      last.current.apk = now;
      setApk(await checkApk(base));
    }
  }, [base]);

  useEffect(() => {
    void run();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void run());
    return () => sub.remove();
  }, [run]);

  return { otaReady, apk, base, recheck: () => run(true) };
}
