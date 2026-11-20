import Constants from 'expo-constants';
import { useState } from 'react';
import { Field, Button, T } from './kit';
import { TextField } from './TextField';

/** Форма підключення: адреса сервера, код, назва телефона. */
export function ServerConnectForm({
  codeLabel,
  defaultName,
  busy,
  onSubmit,
}: {
  codeLabel: string;
  defaultName: string;
  busy: boolean;
  onSubmit: (v: { url: string; code: string; name: string }) => void;
}) {
  const [url, setUrl] = useState<string>((Constants.expoConfig?.extra?.defaultServer as string | undefined) ?? '');
  const [code, setCode] = useState('');
  const [name, setName] = useState(defaultName);
  return (
    <>
      <Field label="Адреса сервера" hint="Напр., 1-2-3-4.sslip.io — її дає адмін після встановлення сервера">
        <TextField value={url} onChangeText={setUrl} placeholder="адреса сервера" autoCapitalize="none" keyboardType="url" maxLength={200} />
      </Field>
      <Field label={codeLabel}>
        <TextField value={code} onChangeText={setCode} placeholder="код" autoCapitalize="characters" maxLength={20} />
      </Field>
      <Field label="Назва цього телефона (видно адміну)">
        <TextField value={name} onChangeText={setName} maxLength={60} />
      </Field>
      <Button
        large
        title="Підключити"
        loading={busy}
        disabled={!url.trim() || code.trim().length < 4 || !name.trim()}
        onPress={() => onSubmit({ url, code, name: name.trim() })}
      />
      <T v="small">Телефон працює й без сервера; дані відправляться, щойно зʼявиться інтернет.</T>
    </>
  );
}
