import { router, Stack } from 'expo-router';
import { useData } from '../../../state/AppProvider';
import { AdminOnly } from '../../../ui/AdminOnly';
import { Banner, Button, Card, Empty, Screen, T } from '../../../ui/kit';

export default function Integrity() {
  const issues = useData((r) => r.data.integrity());
  return (
    <AdminOnly>
      <Screen>
        <Stack.Screen options={{ title: 'Перевірка даних' }} />
        {issues.length === 0 ? (
          <Card>
            <Empty text="Проблем не знайдено ✓" />
          </Card>
        ) : (
          <Banner level="warn" text={`Знайдено проблем: ${issues.length}. Виправте записи в історії генератора.`} />
        )}
        {issues.map((i, idx) => (
          <Card key={idx}>
            <T style={{ fontWeight: '700' }}>{i.message}</T>
            {i.generatorName !== '?' ? (
              <Button
                kind="secondary"
                title="Відкрити генератор"
                onPress={() => router.push({ pathname: '/generator/[id]', params: { id: i.generatorId } })}
              />
            ) : null}
          </Card>
        ))}
      </Screen>
    </AdminOnly>
  );
}
