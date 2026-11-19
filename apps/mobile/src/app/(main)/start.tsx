import { formatMotoHours, formatTime, hoursToMin, minToHours } from '@gen/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useData, useRepos } from '../../state/AppProvider';
import { loadDashboard } from '../../state/dashboard';
import { DateTimeField } from '../../ui/DateTimeField';
import { saveWithConfirm } from '../../ui/errors';
import { Button, Card, Empty, KV, Screen, T } from '../../ui/kit';
import { NumberField } from '../../ui/NumberField';

export default function Start() {
  const { generatorId } = useLocalSearchParams<{ generatorId: string }>();
  const repos = useRepos();
  const card = useData((r) => loadDashboard(r).cards.find((c) => c.generator.id === generatorId), [generatorId]);
  const [meter, setMeter] = useState<number | null>(null);
  const [customTime, setCustomTime] = useState<number | null>(null);

  if (!card) return <Screen><Empty text="Генератор не знайдено" /></Screen>;
  const g = card.generator;

  const save = async () => {
    const ok = await saveWithConfirm((confirm) =>
      repos.sessions.start(g.id, {
        startedAt: customTime ?? Date.now(),
        startMeterMin: meter !== null ? hoursToMin(meter) : null,
        confirm,
      }),
    );
    if (ok) router.back();
  };

  return (
    <Screen>
      <T v="title">{g.name}</T>
      <Card>
        <KV k="Мотогодини зараз (розрахунок)" v={formatMotoHours(card.currentHoursMin)} />
      </Card>
      <NumberField
        label="Показник лічильника на старті (необовʼязково)"
        value={meter}
        onChange={setMeter}
        unit="мгод"
        hint={`Розрахунок: ${formatMotoHours(card.currentHoursMin)}. Якщо лічильник показує інше — введіть показник.`}
      />
      {customTime === null ? (
        <Button kind="ghost" title={`Час запуску: зараз (${formatTime(Date.now())}) — змінити`} onPress={() => setCustomTime(Date.now())} />
      ) : (
        <DateTimeField label="Час запуску" value={customTime} onChange={setCustomTime} maximumDate={Date.now()} />
      )}
      <View style={{ flex: 1 }} />
      <Button kind="ok" large title="▶ Запустити" onPress={save} />
      {meter !== null && minToHours(card.currentHoursMin) > meter ? (
        <T v="small">Увага: показник менший за розрахунковий — перевірте.</T>
      ) : null}
    </Screen>
  );
}
