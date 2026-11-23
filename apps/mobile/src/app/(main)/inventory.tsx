import { formatLiters, litersToMl, mlToLiters } from '@gen/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useData, useRepos } from '../../state/AppProvider';
import { DateTimeField } from '../../ui/DateTimeField';
import { saveWithConfirm } from '../../ui/errors';
import { Button, Card, Choice, Field, KV, Screen, T } from '../../ui/kit';
import { inputFromNum, numFromInput, NumPad } from '../../ui/NumPad';
import { TextField } from '../../ui/TextField';
import { colors } from '../../ui/theme';

/** Інвентаризація: фактичний залишок після вимірювання. Далі залишок рахується від нього. */
export default function InventoryScreen() {
  const params = useLocalSearchParams<{ id?: string; fuelTypeId?: string }>();
  const repos = useRepos();
  const existing = useData((r) => (params.id ? r.fuel.inventories.get(params.id) : undefined), [params.id]);
  const types = useData((r) => r.fuel.types.list());
  const [fuelTypeId, setFuelTypeId] = useState(existing?.fuelTypeId ?? params.fuelTypeId ?? types[0]?.id ?? '');
  const [liters, setLiters] = useState(existing ? inputFromNum(mlToLiters(existing.actualMl)) : '');
  const [at, setAt] = useState(existing?.at ?? Date.now());
  const [note, setNote] = useState(existing?.note ?? '');
  const balance = useData((r) => r.fuel.balanceNow(fuelTypeId), [fuelTypeId]);
  const value = numFromInput(liters);
  const diff = value !== null && !existing ? litersToMl(value) - balance : null;

  const save = async () => {
    if (value === null) return;
    const fields = { at, fuelTypeId, actualMl: litersToMl(value), note: note.trim() };
    const ok = await saveWithConfirm((confirm) =>
      existing ? repos.fuel.inventories.update(existing.id, fields, { confirm }) : repos.fuel.inventories.create(fields, { confirm }),
    );
    if (ok) router.back();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? 'Редагування інвентаризації' : 'Інвентаризація' }} />
      <T v="muted">Введіть, скільки пального фактично є на складі. Далі залишок рахуватиметься від цього значення.</T>
      <Choice value={fuelTypeId} onChange={setFuelTypeId} options={types.map((t) => ({ value: t.id, label: t.name }))} />
      <Card style={{ alignItems: 'center', paddingVertical: 6, gap: 2 }}>
        <T v="huge" style={{ fontSize: 52 }}>
          {liters || '0'}
          <T v="muted" style={{ fontSize: 26 }}> л</T>
        </T>
        {!existing ? <KV k="За обліком" v={formatLiters(balance)} /> : null}
        {diff !== null && diff !== 0 ? (
          <T style={{ color: diff < 0 ? colors.danger : colors.ok, fontWeight: '700' }}>
            {diff < 0 ? `Нестача ${formatLiters(-diff)}` : `Надлишок ${formatLiters(diff)}`}
          </T>
        ) : null}
      </Card>
      <NumPad value={liters} onChange={setLiters} decimals={1} maxLength={7} keyHeight={60} />
      <Button large title="Зберегти" disabled={value === null || !fuelTypeId} onPress={save} />
      <DateTimeField label="Дата й час вимірювання" value={at} onChange={setAt} maximumDate={Date.now()} />
      <Field label="Примітка">
        <TextField value={note} onChangeText={setNote} placeholder="Напр., хто міряв, чим" />
      </Field>
    </Screen>
  );
}
