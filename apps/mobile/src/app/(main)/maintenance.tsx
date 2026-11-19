import { hoursToMin, LABELS, MAINTENANCE_KINDS, minToHours, type MaintenanceKind } from '@gen/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useCurrentUser, useData, useRepos } from '../../state/AppProvider';
import { loadDashboard } from '../../state/dashboard';
import { DateTimeField } from '../../ui/DateTimeField';
import { saveWithConfirm } from '../../ui/errors';
import { Button, Choice, Empty, Field, Screen, T, Toggle } from '../../ui/kit';
import { NumberField } from '../../ui/NumberField';
import { TextField } from '../../ui/TextField';

export default function MaintenanceScreen() {
  const params = useLocalSearchParams<{ generatorId?: string; id?: string }>();
  const repos = useRepos();
  const user = useCurrentUser();
  const existing = useData((r) => (params.id ? r.maintenance.get(params.id) : undefined), [params.id]);
  const generatorId = existing?.generatorId ?? params.generatorId ?? '';
  const { g, hours } = useData(
    (r) => ({
      g: r.generators.get(generatorId),
      hours: loadDashboard(r).cards.find((c) => c.generator.id === generatorId)?.currentHoursMin ?? null,
    }),
    [generatorId],
  );

  const [kind, setKind] = useState<MaintenanceKind>(existing?.kind ?? 'oil');
  const [resets, setResets] = useState(existing?.resetsInterval ?? true);
  const [meter, setMeter] = useState<number | null>(
    existing ? minToHours(existing.meterMin) : hours !== null ? Math.round(minToHours(hours) * 10) / 10 : null,
  );
  const [at, setAt] = useState(existing?.at ?? Date.now());
  const [description, setDescription] = useState(existing?.description ?? '');
  const [performedBy, setPerformedBy] = useState(existing?.performedBy ?? user?.name ?? '');

  if (!g) return <Screen><Empty text="Генератор не знайдено" /></Screen>;

  const save = async () => {
    if (meter === null) return;
    const fields = {
      generatorId: g.id,
      at,
      meterMin: hoursToMin(meter),
      kind,
      resetsInterval: resets,
      description: description.trim(),
      performedBy: performedBy.trim(),
    };
    const ok = await saveWithConfirm((confirm) =>
      existing ? repos.maintenance.update(existing.id, fields, { confirm }) : repos.maintenance.create(fields, { confirm }),
    );
    if (ok) router.back();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? 'Редагування ТО' : 'Обслуговування' }} />
      <T v="h2">{g.name}</T>
      <Choice
        value={kind}
        onChange={(k) => {
          setKind(k);
          if (!existing) setResets(k !== 'repair');
        }}
        options={MAINTENANCE_KINDS.map((k) => ({ value: k, label: LABELS.maintenanceKind[k] }))}
      />
      <Toggle label="Планове ТО (скидає лічильник до наступного ТО)" value={resets} onChange={setResets} />
      <NumberField label="Мотогодини на момент ТО" value={meter} onChange={setMeter} unit="мгод" />
      <DateTimeField label="Дата" value={at} onChange={setAt} maximumDate={Date.now()} />
      <Field label="Що зроблено">
        <TextField value={description} onChangeText={setDescription} placeholder="Напр., масло 10W-30, 1,1 л" multiline />
      </Field>
      <Field label="Хто виконав">
        <TextField value={performedBy} onChangeText={setPerformedBy} maxLength={60} />
      </Field>
      <Button large title="Зберегти" disabled={meter === null} onPress={save} />
    </Screen>
  );
}
