import type { AppSettings, FuelType, SettingsKey } from '@gen/shared';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useData, useRepos } from '../../../state/AppProvider';
import { AdminOnly } from '../../../ui/AdminOnly';
import { showError } from '../../../ui/errors';
import { Button, Card, Field, Row, Screen, T, Toggle } from '../../../ui/kit';
import { NumberField } from '../../../ui/NumberField';
import { TextField } from '../../../ui/TextField';

const FIELDS: { key: SettingsKey; label: string; unit: string; hint: string }[] = [
  { key: 'deviationThresholdPct', label: 'Поріг відхилення витрати', unit: '%', hint: 'Підсвічувати, якщо фактична витрата відрізняється від норми більше ніж на стільки' },
  { key: 'autoLockMinutes', label: 'Автоблокування', unit: 'хв', hint: 'Після скількох хвилин бездіяльності знову питати PIN' },
  { key: 'serviceWarnPct', label: 'Попередження про ТО', unit: '%', hint: 'Попереджати, коли до ТО лишилось менше цієї частки інтервалу' },
  { key: 'backupReminderDays', label: 'Нагадування про резервну копію', unit: 'дн', hint: 'Якщо ручної копії не було довше' },
  { key: 'operatorEditHours', label: 'Оператор змінює свої записи', unit: 'год', hint: 'Скільки годин після створення' },
];

export default function SettingsScreen() {
  const repos = useRepos();
  const settings = useData((r) => r.settings.get());
  const types = useData((r) => r.fuel.types.list({ includeInactive: true }));

  const set = (key: SettingsKey, v: number | null) => {
    if (v === null) return;
    try {
      repos.settings.set(key, v as AppSettings[SettingsKey]);
    } catch (e) {
      showError(e);
    }
  };

  return (
    <AdminOnly>
      <Screen>
        <Stack.Screen options={{ title: 'Налаштування' }} />
        {FIELDS.map((f) => (
          <NumberField
            key={f.key}
            label={f.label}
            value={settings[f.key]}
            onChange={(v) => set(f.key, v)}
            unit={f.unit}
            decimals={0}
            hint={f.hint}
          />
        ))}
        <T v="h2" style={{ marginTop: 8 }}>Типи пального</T>
        {types.map((t) => (
          <FuelTypeRow key={t.id} t={t} />
        ))}
        <NewFuelType />
      </Screen>
    </AdminOnly>
  );
}

function FuelTypeRow({ t }: { t: FuelType }) {
  const repos = useRepos();
  const [name, setName] = useState(t.name);
  return (
    <Card>
      <T v="small">Код: {t.code}</T>
      <TextField value={name} onChangeText={setName} maxLength={30} />
      <Toggle
        label="Використовується"
        value={t.isActive}
        onChange={(v) => {
          try {
            repos.fuel.types.update(t.id, { isActive: v });
          } catch (e) {
            showError(e);
          }
        }}
      />
      {name.trim() !== t.name ? (
        <Button
          title="Зберегти назву"
          onPress={() => {
            try {
              repos.fuel.types.update(t.id, { name: name.trim() });
            } catch (e) {
              showError(e);
            }
          }}
        />
      ) : null}
    </Card>
  );
}

function NewFuelType() {
  const repos = useRepos();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  if (!open) return <Button kind="secondary" title="+ Тип пального" onPress={() => setOpen(true)} />;
  return (
    <Card>
      <Field label="Код (коротко, напр. ДП-Е)">
        <TextField value={code} onChangeText={setCode} maxLength={10} />
      </Field>
      <Field label="Назва">
        <TextField value={name} onChangeText={setName} maxLength={30} />
      </Field>
      <Row>
        <Button kind="ghost" title="Скасувати" onPress={() => setOpen(false)} />
        <Button
          title="Додати"
          disabled={!code.trim() || !name.trim()}
          onPress={() => {
            const exists = repos.fuel.types.list({ includeInactive: true }).some((t) => t.code.toLowerCase() === code.trim().toLowerCase());
            if (exists) return Alert.alert('Такий код уже є');
            try {
              repos.fuel.types.create({ code: code.trim(), name: name.trim(), isActive: true });
              setOpen(false);
              setCode('');
              setName('');
            } catch (e) {
              showError(e);
            }
          }}
        />
      </Row>
      <View />
    </Card>
  );
}
