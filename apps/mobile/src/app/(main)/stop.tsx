import { formatDuration, formatMotoHours, formatTime, hoursToMin, MINUTE } from '@gen/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useData, useNow, useRepos } from '../../state/AppProvider';
import { loadDashboard } from '../../state/dashboard';
import { DateTimeField } from '../../ui/DateTimeField';
import { saveWithConfirm } from '../../ui/errors';
import { Button, Card, Empty, KV, Screen, T } from '../../ui/kit';
import { NumberField } from '../../ui/NumberField';
import { colors } from '../../ui/theme';

export default function Stop() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const repos = useRepos();
  const session = useData((r) => r.sessions.get(sessionId), [sessionId]);
  const { card, at } = useData(
    (r) => ({
      card: session ? loadDashboard(r).cards.find((c) => c.generator.id === session.generatorId) : undefined,
      at: Date.now(),
    }),
    [session?.generatorId],
  );
  const now = useNow(1000);
  const [meter, setMeter] = useState<number | null>(null);
  const [customTime, setCustomTime] = useState<number | null>(null);

  if (!session || session.endedAt !== null || !card) {
    return <Screen><Empty text="Генератор уже зупинено" /></Screen>;
  }
  const estHours = card.currentHoursMin + Math.max(0, (now - at) / MINUTE);

  const save = async () => {
    const ok = await saveWithConfirm((confirm) =>
      repos.sessions.stop(session.id, {
        endedAt: customTime ?? Date.now(),
        endMeterMin: meter !== null ? hoursToMin(meter) : null,
        confirm,
      }),
    );
    if (ok) router.back();
  };

  return (
    <Screen>
      <T v="title">{card.generator.name}</T>
      <Card>
        <T v="muted">Працює з {formatTime(session.startedAt)}</T>
        <T v="huge" style={{ color: colors.ok }}>
          {formatDuration((customTime ?? now) - session.startedAt, true)}
        </T>
        <KV k="Мотогодини (розрахунок)" v={formatMotoHours(estHours)} />
      </Card>
      <NumberField
        label="Показник лічильника в кінці (необовʼязково)"
        value={meter}
        onChange={setMeter}
        unit="мгод"
        hint="Якщо внести показники на старті й у кінці — мотогодини рахуються за лічильником."
      />
      {customTime === null ? (
        <Button kind="ghost" title="Час зупинки: зараз — змінити" onPress={() => setCustomTime(Date.now())} />
      ) : (
        <DateTimeField label="Час зупинки" value={customTime} onChange={setCustomTime} maximumDate={Date.now()} />
      )}
      <View style={{ flex: 1 }} />
      <Button kind="danger" large title="■ Зупинити" onPress={save} />
    </Screen>
  );
}
