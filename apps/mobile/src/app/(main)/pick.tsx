import { formatDuration, LABELS } from '@gen/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useData, useNow } from '../../state/AppProvider';
import { loadDashboard } from '../../state/dashboard';
import { Card, Empty, Screen, T } from '../../ui/kit';
import { colors } from '../../ui/theme';

type Action = 'start' | 'stop' | 'refuel';
const TITLES: Record<Action, string> = {
  start: 'Який генератор запускаємо?',
  stop: 'Який генератор зупиняємо?',
  refuel: 'Який генератор заправляємо?',
};

export default function Pick() {
  const { action = 'refuel' } = useLocalSearchParams<{ action: Action }>();
  const cards = useData((r) => loadDashboard(r).cards);
  const now = useNow(1000);
  const list = cards.filter((c) =>
    action === 'start' ? !c.running && c.generator.status !== 'repair' : action === 'stop' ? !!c.running : true,
  );
  return (
    <Screen>
      <T v="h2">{TITLES[action]}</T>
      {list.length === 0 ? <Empty text="Немає відповідних генераторів" /> : null}
      {list.map((c) => (
        <Card
          key={c.generator.id}
          accent={c.running ? colors.ok : colors.border}
          onPress={() => {
            if (action === 'stop' && c.running) router.replace({ pathname: '/stop', params: { sessionId: c.running.id } });
            else if (action === 'start') router.replace({ pathname: '/start', params: { generatorId: c.generator.id } });
            else router.replace({ pathname: '/refuel', params: { generatorId: c.generator.id } });
          }}
          style={{ minHeight: 88, justifyContent: 'center' }}
        >
          <T v="h2" style={{ fontSize: 26 }}>{c.generator.name}</T>
          <T v="muted">
            {c.running
              ? `Працює ${formatDuration(now - c.running.startedAt)}`
              : LABELS.generatorStatus[c.generator.status]}
            {c.fuelType ? ` · ${c.fuelType.name}` : ''}
          </T>
        </Card>
      ))}
    </Screen>
  );
}
