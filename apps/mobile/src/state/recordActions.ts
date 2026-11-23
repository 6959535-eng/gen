import {
  checkPermission,
  formatDateTime,
  type EntityName,
  type JournalItem,
  type JournalKind,
} from '@gen/shared';
import { router } from 'expo-router';
import { Alert, Platform } from 'react-native';
import { confirmAsync, showError } from '../ui/errors';
import { useCurrentUser, useRepos, useSettings } from './AppProvider';

const KIND_ENTITY: Record<JournalKind, EntityName> = {
  session: 'workSessions',
  refuel: 'refuels',
  maintenance: 'maintenance',
  receipt: 'fuelReceipts',
  issue: 'fuelIssues',
  inventory: 'fuelInventories',
};

/** Дії над записом журналу (зупинити / редагувати / видалити) з урахуванням прав. */
export function useRecordActions(userName: (id: string) => string) {
  const repos = useRepos();
  const user = useCurrentUser();
  const settings = useSettings();

  const edit = (it: JournalItem) => {
    const routes = {
      session: { pathname: '/session-edit', params: { id: it.id } },
      refuel: { pathname: '/refuel', params: { id: it.id } },
      maintenance: { pathname: '/maintenance', params: { id: it.id } },
      receipt: { pathname: '/receipt', params: { id: it.id } },
      issue: { pathname: '/issue', params: { id: it.id } },
      inventory: { pathname: '/inventory', params: { id: it.id } },
    } as const;
    router.push(routes[it.kind]);
  };

  const remove = async (it: JournalItem) => {
    if (!(await confirmAsync('Видалити запис?', `${it.title}\n${formatDateTime(it.at)}`, 'Видалити', true))) return;
    try {
      if (it.kind === 'session') repos.sessions.remove(it.id);
      else if (it.kind === 'refuel') repos.refuels.remove(it.id);
      else if (it.kind === 'maintenance') repos.maintenance.remove(it.id);
      else if (it.kind === 'issue') repos.fuel.issues.remove(it.id);
      else if (it.kind === 'inventory') repos.fuel.inventories.remove(it.id);
      else repos.fuel.receipts.remove(it.id);
    } catch (e) {
      showError(e, 'Не вдалося видалити');
    }
  };

  return (it: JournalItem) => {
    if (!user) return;
    const entity = KIND_ENTITY[it.kind];
    const rec = { authorId: it.authorId, createdAt: it.createdAt };
    const now = Date.now();
    const canEdit = checkPermission(user, 'update', entity, rec, now, settings.operatorEditHours);
    const canDelete = checkPermission(user, 'delete', entity, rec, now, settings.operatorEditHours);
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
    if (it.kind === 'session' && it.running) {
      buttons.push({ text: 'Зупинити', onPress: () => router.push({ pathname: '/stop', params: { sessionId: it.id } }) });
    }
    if (canEdit.ok) buttons.push({ text: 'Редагувати', onPress: () => edit(it) });
    if (canDelete.ok) buttons.push({ text: 'Видалити', style: 'destructive', onPress: () => void remove(it) });
    buttons.push({ text: 'Закрити', style: 'cancel' });
    const why = !canEdit.ok ? `\n\n${canEdit.reason}` : '';
    const msg = `${formatDateTime(it.at)}\n${it.details}\nВніс: ${userName(it.authorId)}${why}`;
    if (Platform.OS === 'web') {
      // Веб-перегляд (розробка): Alert з кнопками в браузері не працює
      if (canEdit.ok && window.confirm(`${it.title}\n${msg}\n\nРедагувати?`)) edit(it);
      return;
    }
    Alert.alert(it.title, msg, buttons);
  };
}
