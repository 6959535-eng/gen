import {
  formatLiters,
  hoursToMin,
  LABELS,
  litersToMl,
  minToHours,
  mlToLiters,
  REFUEL_SOURCES,
  type RefuelSource,
} from '@gen/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useData, useRepos } from '../../state/AppProvider';
import { DateTimeField } from '../../ui/DateTimeField';
import { saveWithConfirm } from '../../ui/errors';
import { Button, Card, Empty, Field, Screen, Segmented, T, Toggle } from '../../ui/kit';
import { NumberField } from '../../ui/NumberField';
import { inputFromNum, numFromInput, NumPad } from '../../ui/NumPad';
import { TextField } from '../../ui/TextField';
import { colors } from '../../ui/theme';

/** Заправка: типовий запис — «Заправка» → літри → «Зберегти». Редагування — з параметром id. */
export default function RefuelScreen() {
  const params = useLocalSearchParams<{ generatorId?: string; id?: string }>();
  const repos = useRepos();
  const existing = useData((r) => (params.id ? r.refuels.get(params.id) : undefined), [params.id]);
  const generatorId = existing?.generatorId ?? params.generatorId ?? '';
  const g = useData((r) => r.generators.get(generatorId), [generatorId]);

  const [liters, setLiters] = useState(existing ? inputFromNum(mlToLiters(existing.volumeMl)) : '');
  const [isFull, setIsFull] = useState(existing?.isFull ?? true);
  const [source, setSource] = useState<RefuelSource>(existing?.source ?? 'warehouse');
  const [meter, setMeter] = useState<number | null>(existing?.meterMin != null ? minToHours(existing.meterMin) : null);
  const [at, setAt] = useState<number | null>(existing?.at ?? null);
  const [note, setNote] = useState(existing?.note ?? '');
  const [more, setMore] = useState(!!existing);

  if (!g) return <Screen><Empty text="Генератор не знайдено" /></Screen>;
  const value = numFromInput(liters);

  const save = async () => {
    if (!value || value <= 0) return;
    const fields = {
      generatorId: g.id,
      fuelTypeId: g.fuelTypeId,
      at: at ?? Date.now(),
      volumeMl: litersToMl(value),
      isFull,
      source,
      meterMin: meter !== null ? hoursToMin(meter) : null,
      note: note.trim(),
    };
    const ok = await saveWithConfirm((confirm) =>
      existing ? repos.refuels.update(existing.id, fields, { confirm }) : repos.refuels.create(fields, { confirm }),
    );
    if (ok) router.back();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? 'Редагування заправки' : 'Заправка' }} />
      <T v="h2">{g.name}</T>
      <Card style={{ alignItems: 'center', paddingVertical: 6, gap: 2 }}>
        <T v="huge" style={{ fontSize: 56 }}>
          {liters || '0'}
          <T v="muted" style={{ fontSize: 28 }}> л</T>
        </T>
        <T v="small">Бак: {formatLiters(g.tankMl)}</T>
        {value !== null && litersToMl(value) > g.tankMl ? (
          <T style={{ color: colors.warn }}>Більше за обʼєм бака</T>
        ) : null}
      </Card>
      <NumPad value={liters} onChange={setLiters} decimals={1} maxLength={6} keyHeight={62} />
      <Toggle label="До повного бака" value={isFull} onChange={setIsFull} />
      <Segmented
        value={source}
        onChange={setSource}
        options={REFUEL_SOURCES.map((s) => ({ value: s, label: LABELS.refuelSource[s] }))}
      />
      <Button large title={existing ? 'Зберегти зміни' : 'Зберегти'} disabled={!value || value <= 0} onPress={save} />
      {more ? (
        <View style={{ gap: 12 }}>
          <NumberField label="Показник мотогодин (необовʼязково)" value={meter} onChange={setMeter} unit="мгод" />
          <DateTimeField label="Дата й час" value={at ?? Date.now()} onChange={setAt} maximumDate={Date.now()} />
          <Field label="Примітка">
            <TextField value={note} onChangeText={setNote} placeholder="Необовʼязково" />
          </Field>
        </View>
      ) : (
        <Button kind="ghost" title="Мотогодини, час, примітка…" onPress={() => setMore(true)} />
      )}
    </Screen>
  );
}
