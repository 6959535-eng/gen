import {
  GENERATOR_STATUSES,
  hoursToMin,
  LABELS,
  litersToMl,
  minToHours,
  mlToLiters,
  type GeneratorStatus,
} from '@gen/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useData, useRepos } from '../../../state/AppProvider';
import { AdminOnly } from '../../../ui/AdminOnly';
import { confirmAsync, showError } from '../../../ui/errors';
import { Button, Choice, Field, Screen, T } from '../../../ui/kit';
import { NumberField } from '../../../ui/NumberField';
import { TextField } from '../../../ui/TextField';

export default function GeneratorEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const repos = useRepos();
  const existing = useData((r) => (id ? r.generators.get(id) : undefined), [id]);
  const types = useData((r) => r.fuel.types.list());

  const [name, setName] = useState(existing?.name ?? '');
  const [inventoryNo, setInv] = useState(existing?.inventoryNo ?? '');
  const [model, setModel] = useState(existing?.model ?? '');
  const [powerKw, setPower] = useState<number | null>(existing?.powerW ? existing.powerW / 1000 : null);
  const [fuelTypeId, setFuel] = useState(existing?.fuelTypeId ?? types[0]?.id ?? '');
  const [tankL, setTank] = useState<number | null>(existing ? mlToLiters(existing.tankMl) : null);
  const [normL, setNorm] = useState<number | null>(existing ? mlToLiters(existing.normMlPerH) : null);
  const [initialH, setInitial] = useState<number | null>(existing ? minToHours(existing.initialHoursMin) : 0);
  const [intervalH, setSvcInterval] = useState<number | null>(existing ? minToHours(existing.serviceIntervalMin) : 100);
  const [status, setStatus] = useState<GeneratorStatus>(existing?.status ?? 'active');
  const [responsible, setResp] = useState(existing?.responsible ?? '');
  const [note, setNote] = useState(existing?.note ?? '');

  const missing = !name.trim() || !fuelTypeId || !tankL || !normL || !intervalH;

  const save = () => {
    const fields = {
      name: name.trim(),
      inventoryNo: inventoryNo.trim(),
      model: model.trim(),
      powerW: powerKw ? Math.round(powerKw * 1000) : null,
      fuelTypeId,
      tankMl: litersToMl(tankL ?? 0),
      normMlPerH: litersToMl(normL ?? 0),
      initialHoursMin: hoursToMin(initialH ?? 0),
      serviceIntervalMin: hoursToMin(intervalH ?? 0),
      status,
      responsible: responsible.trim(),
      note: note.trim(),
    };
    try {
      if (existing) repos.generators.update(existing.id, fields);
      else repos.generators.create(fields);
      router.back();
    } catch (e) {
      showError(e);
    }
  };

  const remove = async () => {
    if (!existing) return;
    const ok = await confirmAsync(
      'Видалити генератор?',
      'Генератор зникне зі списків разом з історією на екранах. Якщо його просто більше не використовують — краще поставити статус «Списаний».',
      'Видалити',
      true,
    );
    if (!ok) return;
    try {
      repos.generators.remove(existing.id);
      router.dismissTo('/admin/generators');
    } catch (e) {
      showError(e);
    }
  };

  return (
    <AdminOnly>
      <Screen>
        <Stack.Screen options={{ title: existing ? existing.name : 'Новий генератор' }} />
        <Field label="Назва / позивний *">
          <TextField value={name} onChangeText={setName} maxLength={40} placeholder="Напр., Г-4 «Дельта»" />
        </Field>
        <Field label="Інвентарний номер">
          <TextField value={inventoryNo} onChangeText={setInv} maxLength={40} />
        </Field>
        <Field label="Модель">
          <TextField value={model} onChangeText={setModel} maxLength={60} />
        </Field>
        <NumberField label="Потужність" value={powerKw} onChange={setPower} unit="кВт" />
        <Field label="Тип пального *">
          <Choice value={fuelTypeId} onChange={setFuel} options={types.map((t) => ({ value: t.id, label: t.name }))} />
        </Field>
        <NumberField label="Обʼєм бака *" value={tankL} onChange={setTank} unit="л" />
        <NumberField label="Нормативна витрата *" value={normL} onChange={setNorm} unit="л/год" decimals={2} />
        <NumberField
          label="Мотогодини на момент внесення"
          value={initialH}
          onChange={setInitial}
          unit="мгод"
          hint="Показник лічильника, з якого починається облік у додатку"
        />
        <NumberField label="Інтервал ТО *" value={intervalH} onChange={setSvcInterval} unit="мгод" decimals={0} />
        <Field label="Статус">
          <Choice
            value={status}
            onChange={setStatus}
            options={GENERATOR_STATUSES.map((s) => ({ value: s, label: LABELS.generatorStatus[s] }))}
          />
        </Field>
        <Field label="Відповідальна особа">
          <TextField value={responsible} onChangeText={setResp} maxLength={60} />
        </Field>
        <Field label="Примітка">
          <TextField value={note} onChangeText={setNote} multiline />
        </Field>
        {missing ? <T v="small">* — обовʼязкові поля</T> : null}
        <Button large title="Зберегти" disabled={missing} onPress={save} />
        {existing ? <Button kind="ghost" title="Видалити генератор" onPress={remove} /> : null}
      </Screen>
    </AdminOnly>
  );
}
