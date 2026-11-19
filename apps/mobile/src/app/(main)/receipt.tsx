import { formatLiters, litersToMl, mlToLiters } from '@gen/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useData, useRepos } from '../../state/AppProvider';
import { DateTimeField } from '../../ui/DateTimeField';
import { saveWithConfirm } from '../../ui/errors';
import { Button, Card, Choice, Field, Screen, T } from '../../ui/kit';
import { inputFromNum, numFromInput, NumPad } from '../../ui/NumPad';
import { TextField } from '../../ui/TextField';

/** Надходження пального на склад. */
export default function ReceiptScreen() {
  const params = useLocalSearchParams<{ id?: string; fuelTypeId?: string }>();
  const repos = useRepos();
  const existing = useData((r) => (params.id ? r.fuel.receipts.get(params.id) : undefined), [params.id]);
  const types = useData((r) => r.fuel.types.list());
  const [fuelTypeId, setFuelTypeId] = useState(existing?.fuelTypeId ?? params.fuelTypeId ?? types[0]?.id ?? '');
  const [liters, setLiters] = useState(existing ? inputFromNum(mlToLiters(existing.volumeMl)) : '');
  const [supplier, setSupplier] = useState(existing?.supplier ?? '');
  const [at, setAt] = useState(existing?.at ?? Date.now());
  const [note, setNote] = useState(existing?.note ?? '');
  const value = numFromInput(liters);

  const save = async () => {
    if (!value) return;
    const fields = { at, fuelTypeId, volumeMl: litersToMl(value), supplier: supplier.trim(), note: note.trim() };
    const ok = await saveWithConfirm((confirm) =>
      existing ? repos.fuel.receipts.update(existing.id, fields, { confirm }) : repos.fuel.receipts.create(fields, { confirm }),
    );
    if (ok) router.back();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? 'Редагування надходження' : 'Надходження пального' }} />
      <Choice value={fuelTypeId} onChange={setFuelTypeId} options={types.map((t) => ({ value: t.id, label: t.name }))} />
      <Card style={{ alignItems: 'center', paddingVertical: 6, gap: 2 }}>
        <T v="huge" style={{ fontSize: 52 }}>
          {liters || '0'}
          <T v="muted" style={{ fontSize: 26 }}> л</T>
        </T>
        {value ? <T v="small">{formatLiters(litersToMl(value))}</T> : null}
      </Card>
      <NumPad value={liters} onChange={setLiters} decimals={1} maxLength={7} keyHeight={60} />
      <Button large title="Зберегти" disabled={!value || !fuelTypeId} onPress={save} />
      <Field label="Від кого">
        <TextField value={supplier} onChangeText={setSupplier} placeholder="Напр., склад бригади, АЗС" maxLength={80} />
      </Field>
      <DateTimeField label="Дата й час" value={at} onChange={setAt} maximumDate={Date.now()} />
      <Field label="Примітка">
        <TextField value={note} onChangeText={setNote} placeholder="Необовʼязково" />
      </Field>
    </Screen>
  );
}
