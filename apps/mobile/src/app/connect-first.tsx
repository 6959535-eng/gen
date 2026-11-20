import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { pairDevice, syncNow } from '../services/syncCore';
import { useRepos } from '../state/AppProvider';
import { useSyncDeps } from '../state/sync';
import { showError } from '../ui/errors';
import { Card, Screen, T } from '../ui/kit';
import { ServerConnectForm } from '../ui/ServerConnectForm';

/** Перший запуск нового телефона: підключення до сервера й отримання всієї бази. */
export default function ConnectFirst() {
  const repos = useRepos();
  const deps = useSyncDeps();
  const [busy, setBusy] = useState(false);
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Підключення до сервера' }} />
      <Card>
        <T>Попросіть адміна: «Дані й копії → Сервер → Створити код підключення». Код одноразовий, діє 15 хвилин.</T>
      </Card>
      <ServerConnectForm
        codeLabel="Код підключення від адміна"
        defaultName="Телефон"
        busy={busy}
        onSubmit={async (v) => {
          setBusy(true);
          try {
            await pairDevice(deps, v.url, v.code, v.name);
            await syncNow(deps);
            if (!repos.users.hasAny()) throw new Error('На сервері ще немає профілів — спершу адмін має підключити свій телефон');
            router.replace('/login');
          } catch (e) {
            showError(e, 'Не вдалося підключитися');
          } finally {
            setBusy(false);
          }
        }}
      />
    </Screen>
  );
}
