import { formatDateTime, GenFileError, MIN_PASSWORD_LENGTH, type ContainerHeader, type ExportPayload } from '@gen/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { inspectGenFile, openGenFile, teamPassword } from '../services/backupCore';
import { files, readUri, secrets } from '../services/platform';
import { useCurrentUser } from '../state/AppProvider';
import { Banner, Button, Card, Field, T, Toggle } from './kit';
import { TextField } from './TextField';
import { colors } from './theme';

export type GenSource = { uri: string } | { path: string } | { bytes: Uint8Array; name: string };
export interface OpenedFile {
  header: ContainerHeader;
  payload: ExportPayload;
}

type State =
  | { s: 'loading' }
  | { s: 'password'; bytes: Uint8Array; header: ContainerHeader; error?: string }
  | { s: 'decrypting'; progress: number }
  | { s: 'error'; message: string }
  | { s: 'done' };

const KIND_LABEL: Record<ContainerHeader['kind'], string> = {
  export: 'Експорт',
  backup: 'Резервна копія',
  'auto-backup': 'Автоматична копія',
};

/** Відкриває файл .gen: читання → пароль (якщо треба) → розшифрування з прогресом → onOpened. */
export function GenFileGate({ source, onOpened }: { source: GenSource; onOpened: (f: OpenedFile) => void }) {
  const user = useCurrentUser();
  const [state, setState] = useState<State>({ s: 'loading' });
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const started = useRef(false);

  const decrypt = useCallback(
    async (bytes: Uint8Array, header: ContainerHeader, pwd?: string, rememberIt = false) => {
      setState({ s: 'decrypting', progress: 0 });
      try {
        const opened = await openGenFile(
          { secrets, onProgress: (p) => setState({ s: 'decrypting', progress: p }) },
          bytes,
          pwd,
        );
        if (pwd && rememberIt) await teamPassword.set(secrets, pwd);
        setState({ s: 'done' });
        onOpened(opened);
      } catch (e) {
        if (e instanceof GenFileError && e.code === 'bad_password' && header.kdf.name === 'scrypt') {
          setState({ s: 'password', bytes, header, error: pwd ? 'Пароль не підходить' : undefined });
        } else {
          setState({ s: 'error', message: e instanceof Error ? e.message : String(e) });
        }
      }
    },
    [onOpened],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const bytes =
          'bytes' in source ? source.bytes : 'path' in source ? await files.read(source.path) : await readUri(source.uri);
        const { header, need } = inspectGenFile(bytes);
        if (need === 'device') return decrypt(bytes, header);
        const saved = await teamPassword.get(secrets);
        if (saved) return decrypt(bytes, header, saved);
        setState({ s: 'password', bytes, header });
      } catch (e) {
        setState({ s: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
  }, [source, decrypt]);

  if (state.s === 'loading') return <ActivityIndicator size="large" color={colors.accent} />;
  if (state.s === 'done') return null;
  if (state.s === 'error') return <Banner level="danger" text={state.message} />;
  if (state.s === 'decrypting') {
    return (
      <Card style={{ alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.accent} />
        <T>Розшифрування… {Math.round(state.progress * 100)}%</T>
        <T v="small">На слабкому телефоні це може зайняти до пів хвилини</T>
      </Card>
    );
  }
  return (
    <View style={{ gap: 12 }}>
      <Card>
        <T v="muted">{KIND_LABEL[state.header.kind]} від {formatDateTime(state.header.createdAt)}</T>
        <T>Файл зашифровано паролем команди.</T>
      </Card>
      {state.error ? <Banner level="danger" text={state.error} /> : null}
      <Field label="Пароль">
        <TextField value={password} onChangeText={setPassword} secure autoFocus maxLength={200} placeholder="Пароль команди" />
      </Field>
      {user?.role === 'admin' || !user ? (
        <Toggle label="Запамʼятати як пароль команди на цьому телефоні" value={remember} onChange={setRemember} />
      ) : null}
      <Button
        large
        title="Відкрити"
        disabled={password.length < MIN_PASSWORD_LENGTH}
        onPress={() => decrypt(state.bytes, state.header, password, remember && (user?.role === 'admin' || !user))}
      />
    </View>
  );
}
