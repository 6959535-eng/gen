import { formatNumber, LABELS } from '@gen/shared';
import { router, Stack } from 'expo-router';
import { useData } from '../../../state/AppProvider';
import { AdminOnly } from '../../../ui/AdminOnly';
import { Button, Card, Screen, T } from '../../../ui/kit';
import { colors } from '../../../ui/theme';

export default function AdminGenerators() {
  const d = useData((r) => ({
    gens: r.generators.list({ includeDecommissioned: true }),
    types: new Map(r.fuel.types.list({ includeInactive: true }).map((t) => [t.id, t.name])),
  }));
  return (
    <AdminOnly>
      <Screen>
        <Stack.Screen options={{ title: 'Генератори' }} />
        <Button title="+ Новий генератор" onPress={() => router.push('/admin/generator-edit')} />
        {d.gens.map((g) => (
          <Card
            key={g.id}
            accent={g.status === 'decommissioned' ? colors.muted : g.status === 'repair' ? colors.danger : colors.accent}
            onPress={() => router.push({ pathname: '/admin/generator-edit', params: { id: g.id } })}
          >
            <T v="h2">{g.name}</T>
            <T v="muted">
              {LABELS.generatorStatus[g.status]} · {d.types.get(g.fuelTypeId) ?? '?'} · норма {formatNumber(g.normMlPerH / 1000, 2)} л/год
            </T>
          </Card>
        ))}
      </Screen>
    </AdminOnly>
  );
}
