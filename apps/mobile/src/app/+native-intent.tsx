import { usePendingFile } from '../state/pendingFile';

/**
 * «Відкрити за допомогою» з месенджера чи файлового менеджера: Android передає content:// або file://.
 * Запамʼятовуємо файл і йдемо на старт: далі — вхід, потім екран імпорту.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  try {
    if (/^(content|file):\/\//i.test(path)) {
      usePendingFile.getState().set(path);
      return '/';
    }
    return path;
  } catch {
    return '/';
  }
}
