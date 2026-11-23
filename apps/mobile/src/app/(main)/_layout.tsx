import { Redirect, Stack, router } from 'expo-router';
import { useEffect } from 'react';
import { AppState, View } from 'react-native';
import { useCurrentUser, useSettings } from '../../state/AppProvider';
import { runAutoBackupIfDue } from '../../services/backupCore';
import { useBackupDeps } from '../../state/backupDeps';
import { useSession } from '../../state/session';
import { useAutoSync } from '../../state/sync';
import { colors } from '../../ui/theme';

/** Захищена частина: без входу — на екран профілів; автоблокування після бездіяльності. */
export default function MainLayout() {
  const user = useCurrentUser();
  const { autoLockMinutes } = useSettings();

  useEffect(() => {
    const limit = autoLockMinutes * 60_000;
    const check = () => {
      const s = useSession.getState();
      if (s.user && Date.now() - s.lastActivityAt > limit) {
        s.signOut();
        router.replace('/login');
      }
    };
    const t = setInterval(check, 5_000);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') check();
    });
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [autoLockMinutes]);

  // Щоденна автоматична копія: при вході й при поверненні в додаток
  const deps = useBackupDeps();
  useEffect(() => {
    const run = () => runAutoBackupIfDue(deps).catch((e) => console.warn('auto-backup', e));
    run();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && run());
    return () => sub.remove();
  }, [deps]);

  useAutoSync();

  if (!user) return <Redirect href="/login" />;

  return (
    <View
      style={{ flex: 1 }}
      onStartShouldSetResponderCapture={() => {
        useSession.getState().touch();
        return false;
      }}
    >
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerTitleStyle: { fontSize: 20, fontWeight: '700' },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="home" options={{ title: 'Генератори', headerBackVisible: false, gestureEnabled: false }} />
        <Stack.Screen name="start" options={{ title: 'Запуск' }} />
        <Stack.Screen name="stop" options={{ title: 'Зупинка' }} />
        <Stack.Screen name="refuel" options={{ title: 'Заправка' }} />
        <Stack.Screen name="pick" options={{ title: 'Оберіть генератор' }} />
        <Stack.Screen name="session-edit" options={{ title: 'Сесія роботи' }} />
        <Stack.Screen name="journal" options={{ title: 'Журнал' }} />
        <Stack.Screen name="generator/[id]" options={{ title: 'Генератор' }} />
        <Stack.Screen name="maintenance" options={{ title: 'Обслуговування' }} />
        <Stack.Screen name="fuel" options={{ title: 'Склад пального' }} />
        <Stack.Screen name="receipt" options={{ title: 'Надходження' }} />
        <Stack.Screen name="issue" options={{ title: 'Видача зі складу' }} />
        <Stack.Screen name="inventory" options={{ title: 'Інвентаризація' }} />
        <Stack.Screen name="data" options={{ title: 'Дані' }} />
        <Stack.Screen name="import" options={{ title: 'Імпорт даних' }} />
        <Stack.Screen name="restore" options={{ title: 'Відновлення з копії' }} />
        <Stack.Screen name="server" options={{ title: 'Сервер' }} />
        <Stack.Screen name="about" options={{ title: 'Про додаток' }} />
      </Stack>
    </View>
  );
}
