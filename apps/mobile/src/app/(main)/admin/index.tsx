import { router, Stack } from 'expo-router';
import { useData } from '../../../state/AppProvider';
import { AdminOnly } from '../../../ui/AdminOnly';
import { MenuItem, Screen } from '../../../ui/kit';

export default function AdminMenu() {
  const counts = useData((r) => ({
    users: r.users.list({ includeInactive: true }).length,
    gens: r.generators.list({ includeDecommissioned: true }).length,
    issues: r.data.integrity().length,
  }));
  return (
    <AdminOnly>
      <Screen>
        <Stack.Screen options={{ title: 'Адмінка' }} />
        <MenuItem title="Профілі" subtitle={`${counts.users} · ролі, PIN, блокування`} onPress={() => router.push('/admin/users')} />
        <MenuItem title="Генератори" subtitle={`${counts.gens} · додати, змінити, списати`} onPress={() => router.push('/admin/generators')} />
        <MenuItem title="Налаштування" subtitle="Пороги, автоблокування, типи пального" onPress={() => router.push('/admin/settings')} />
        <MenuItem title="Журнал змін" subtitle="Хто, коли і що змінив" onPress={() => router.push('/admin/audit')} />
        <MenuItem
          title="Перевірка даних"
          subtitle="Відкриті й накладені сесії, лічильники"
          badge={counts.issues ? String(counts.issues) : undefined}
          onPress={() => router.push('/admin/integrity')}
        />
      </Screen>
    </AdminOnly>
  );
}
