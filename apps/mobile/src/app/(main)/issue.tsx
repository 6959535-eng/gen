import { formatLiters, litersToMl, mlToLiters } from '@gen/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useData, useRepos } from '../../state/AppProvider';
import { DateTimeField } from '../../ui/DateTimeField';
import { saveWithConfirm } from '../../ui/errors';
import { Button, Card, Choice, Field, Screen, T } from '../../ui/kit';
import { inputFromNum, numFromInput, NumPad } from '../../ui/NumPad';
import { TextField } from '../../ui/TextField';
import { colors } from '../../ui/theme';

/** Видача пального зі складу (кому / куди). На генератори не впливає. */
export default function IssueScreen() {
  const params = useLocalSearchParams<{ id?: string; fuelTypeId?: string }>();
  const repos = useRepos();
  const existing = useData((r) => (params.id ? r.fuel.issues.get(params.id) : undefined), [params.id]);
  const types = useData((r) => r.fuel.types.list());
  const [fuelTypeId, setFuelTypeId] = useState(existing?.fuelTypeId ?? params.fuelTypeId ?? types[0]?.id ?? '');
  const [liters, setLiters] = useState(existing ? inputFromNum(mlToLiters(existing.volumeMl)) : '');
  const [recipient, setRecipient] = useState(existing?.recipient ?? '');
  const [at, setAt] = useState(existing?.at ?? Date.now());
  const [note, setNote] = useState(existing?.note ?? '');
  const balance = useData((r) => r.fuel.balanceNow(fuelTypeId), [fuelTypeId]);
  const value = numFromInput(liters);

  const save = async () => {
    if (!value) return;
    const fields = { at, fuelTypeId, volumeMl: litersToMl(value), recipient: recipient.trim(), note: note.trim() };
    const ok = await saveWithConfirm((confirm) =>
      existing ? repos.fuel.issues.update(existing.id, fields, { confirm }) : repos.fuel.issues.create(fields, { confirm }),
    );
    if (ok) router.back();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? 'Редагування видачі' : 'Видача зі складу' }} />
      <Choice value={fuelTypeId} onChange={setFuelTypeId} options={types.map((t) => ({ value: t.id, label: t.name }))} />
      <Card style={{ alignItems: 'center', paddingVertical: 6, gap: 2 }}>
        <T v="huge" style={{ fontSize: 52, color: colors.danger }}>
          −{liters || '0'}
          <T v="muted" style={{ fontSize: 26 }}> л</T>
        </T>
        <T v="small">На складі за обліком: {formatLiters(balance)}</T>
      </Card>
      <NumPad value={liters} onChange={setLiters} decimals={1} maxLength={7} keyHeight={60} />
      <Field label="Кому / куди">
        <TextField value={recipient} onChangeText={setRecipient} placeholder="Напр., авто АА1234, каністри на позицію" maxLength={80} />
      </Field>
      <Button large title="Зберегти" disabled={!value || !fuelTypeId} onPress={save} />
      <DateTimeField label="Дата й час" value={at} onChange={setAt} maximumDate={Date.now()} />
      <Field label="Примітка">
        <TextField value={note} onChangeText={setNote} placeholder="Необовʼязково" />
      </Field>
    </Screen>
  );
}
