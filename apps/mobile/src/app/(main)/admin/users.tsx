import { LABELS } from '@gen/shared';
import { router, Stack } from 'expo-router';
import { useData } from '../../../state/AppProvider';
import { AdminOnly } from '../../../ui/AdminOnly';
import { Button, Card, Pill, Screen, T } from '../../../ui/kit';
import { colors } from '../../../ui/theme';

export default function Users() {
  const users = useData((r) => r.users.list({ includeInactive: true }));
  return (
    <AdminOnly>
      <Screen>
        <Stack.Screen options={{ title: 'Профілі' }} />
        <Button title="+ Новий профіль" onPress={() => router.push('/admin/user-edit')} />
        {users.map((u) => (
          <Card
            key={u.id}
            accent={!u.isActive ? colors.danger : u.role === 'admin' ? colors.accent : colors.info}
            onPress={() => router.push({ pathname: '/admin/user-edit', params: { id: u.id } })}
          >
            <T v="h2">{u.name}</T>
            <T v="muted">{LABELS.role[u.role]}</T>
            {!u.isActive ? <Pill text="ЗАБЛОКОВАНО" color="#fecaca" bg={colors.dangerDark} /> : null}
          </Card>
        ))}
      </Screen>
    </AdminOnly>
  );
}
