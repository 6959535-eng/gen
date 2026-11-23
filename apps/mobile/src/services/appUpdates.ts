/**
 * Оновлення додатка без доступу до телефонів:
 *  1) OTA (JavaScript-частина) — expo-updates з вашого сервера, підпис перевіряється на телефоні;
 *  2) новий APK — додаток завантажує його з сервера й відкриває встановлення (одне натискання).
 */
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

export interface ApkInfo {
  versionCode: number;
  versionName: string;
  url: string;
  sha256: string;
  notes?: string;
}

/** Адреса сервера: підключений або вбудований за замовчуванням. */
export function serverBase(connectedUrl: string | null): string {
  if (connectedUrl) return connectedUrl;
  const d = Constants.expoConfig?.extra?.defaultServer as string | undefined;
  return d ? `https://${d}` : '';
}

export const nativeVersion = {
  name: Application.nativeApplicationVersion ?? '—',
  code: Number(Application.nativeBuildVersion ?? 0),
};

export const otaInfo = () => ({
  enabled: Updates.isEnabled,
  updateId: Updates.updateId,
  createdAt: Updates.createdAt,
  isEmbedded: Updates.isEmbeddedLaunch,
  runtimeVersion: Updates.runtimeVersion,
  message: (Updates.manifest as { extra?: { message?: string } } | undefined)?.extra?.message ?? '',
});

/** Перевірити й завантажити OTA. true — оновлення завантажене й чекає перезапуску. */
export async function fetchOtaUpdate(): Promise<boolean> {
  if (!Updates.isEnabled) return false;
  const check = await Updates.checkForUpdateAsync();
  if (!check.isAvailable) return false;
  const res = await Updates.fetchUpdateAsync();
  return res.isNew;
}

export const applyOtaUpdate = () => Updates.reloadAsync();

/** Чи є на сервері новіший APK. */
export async function checkApk(base: string): Promise<ApkInfo | null> {
  if (Platform.OS !== 'android' || !base) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(`${base}/api/app/latest`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const info = (await res.json()) as ApkInfo;
    return info.versionCode > nativeVersion.code ? info : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Завантажити APK, перевірити контрольну суму й відкрити системне встановлення. */
export async function downloadAndInstallApk(base: string, info: ApkInfo): Promise<void> {
  const dir = new Directory(Paths.cache, 'apk');
  if (dir.exists) dir.delete();
  dir.create({ intermediates: true });
  const file = await File.downloadFileAsync(`${base}${info.url}`, dir);
  const hash = await file.digest('SHA-256');
  if (info.sha256 && hash.toLowerCase() !== info.sha256.toLowerCase()) {
    file.delete();
    throw new Error('Файл пошкоджено під час завантаження — спробуйте ще раз');
  }
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: file.contentUri,
    type: 'application/vnd.android.package-archive',
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
  });
}
