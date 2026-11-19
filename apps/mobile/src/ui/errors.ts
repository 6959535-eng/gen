import { GenFileError } from '@gen/shared';
import { Alert, Platform } from 'react-native';
import { RepoError } from '../repositories';

/** Показати помилку зрозумілою мовою. */
export function showError(e: unknown, title = 'Не вдалося зберегти') {
  const msg =
    e instanceof RepoError || e instanceof GenFileError
      ? e.message
      : e instanceof Error
        ? `Непередбачена помилка: ${e.message}`
        : String(e);
  Alert.alert(title, msg);
}

/**
 * Виконати збереження; якщо є попередження (needs_confirmation) — запитати й повторити з confirm.
 * Повертає true, якщо збережено.
 */
export async function saveWithConfirm(save: (confirm: boolean) => void): Promise<boolean> {
  try {
    save(false);
    return true;
  } catch (e) {
    if (e instanceof RepoError && e.code === 'needs_confirmation') {
      const ok = await confirmAsync('Перевірте', e.message, 'Так, зберегти', false, 'Виправити');
      if (!ok) return false;
      try {
        save(true);
        return true;
      } catch (e2) {
        showError(e2);
        return false;
      }
    }
    showError(e);
    return false;
  }
}

export function confirmAsync(
  title: string,
  message: string,
  okText = 'Так',
  destructive = false,
  cancelText = 'Скасувати',
): Promise<boolean> {
  // Веб-перегляд (лише розробка): Alert з кнопками в браузері не працює
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
      { text: okText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]),
  );
}
