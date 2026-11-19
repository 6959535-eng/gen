import { hoursToMin, minToHours } from '@gen/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useData, useRepos } from '../../state/AppProvider';
import { DateTimeField } from '../../ui/DateTimeField';
import { saveWithConfirm } from '../../ui/errors';
import { Button, Empty, Field, Screen, T, Toggle } from '../../ui/kit';
import { NumberField } from '../../ui/NumberField';
import { TextField } from '../../ui/TextField';

/** Створення сесії заднім числом або редагування наявної. */
export default function SessionEdit() {
  const params = useLocalSearchParams<{ id?: string; generatorId?: string }>();
  const repos = useRepos();
  const existing = useData((r) => (params.id ? r.sessions.get(params.id) : undefined), [params.id]);
  const generatorId = existing?.generatorId ?? params.generatorId ?? '';
  const g = useData((r) => r.generators.get(generatorId), [generatorId]);

  const [startedAt, setStartedAt] = useState(existing?.startedAt ?? Date.now() - 3_600_000);
  const [stillRunning, setStillRunning] = useState(existing ? existing.endedAt === null : false);
  const [endedAt, setEndedAt] = useState(existing?.endedAt ?? Date.now());
  const [startMeter, setStartMeter] = useState<number | null>(
    existing?.startMeterMin != null ? minToHours(existing.startMeterMin) : null,
  );
  const [endMeter, setEndMeter] = useState<number | null>(
    existing?.endMeterMin != null ? minToHours(existing.endMeterMin) : null,
  );
  const [note, setNote] = useState(existing?.note ?? '');

  if (!g) return <Screen><Empty text="Генератор не знайдено" /></Screen>;

  const save = async () => {
    const fields = {
      generatorId: g.id,
      startedAt,
      endedAt: stillRunning ? null : endedAt,
      startMeterMin: startMeter !== null ? hoursToMin(startMeter) : null,
      endMeterMin: !stillRunning && endMeter !== null ? hoursToMin(endMeter) : null,
      note: note.trim(),
    };
    const ok = await saveWithConfirm((confirm) =>
      existing ? repos.sessions.update(existing.id, fields, { confirm }) : repos.sessions.create(fields, { confirm }),
    );
    if (ok) router.back();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? 'Редагування сесії' : 'Внести роботу' }} />
      <T v="h2">{g.name}</T>
      <DateTimeField label="Початок" value={startedAt} onChange={setStartedAt} maximumDate={Date.now()} />
      <Toggle label="Ще працює" value={stillRunning} onChange={setStillRunning} />
      {!stillRunning ? (
        <DateTimeField label="Кінець" value={endedAt} onChange={setEndedAt} maximumDate={Date.now()} />
      ) : null}
      <NumberField label="Лічильник на початку (необовʼязково)" value={startMeter} onChange={setStartMeter} unit="мгод" />
      {!stillRunning ? (
        <NumberField label="Лічильник у кінці (необовʼязково)" value={endMeter} onChange={setEndMeter} unit="мгод" />
      ) : null}
      <Field label="Примітка">
        <TextField value={note} onChangeText={setNote} placeholder="Необовʼязково" />
      </Field>
      <Button large title="Зберегти" onPress={save} />
    </Screen>
  );
}
