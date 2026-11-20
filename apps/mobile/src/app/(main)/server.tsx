import { formatDateTime, formatDuration, formatTime, type DeviceInfo } from '@gen/shared';
import { Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import {
  createPairingCode,
  disconnect,
  listDevices,
  pairDevice,
  revokeDevice,
  syncNow,
  SyncError,
} from '../../services/syncCore';
import { useCurrentUser, useData, useNow } from '../../state/AppProvider';
import { useSyncDeps, useSyncStatus } from '../../state/sync';
import { confirmAsync, showError } from '../../ui/errors';
import { Banner, Button, Card, KV, Screen, T } from '../../ui/kit';
import { ServerConnectForm } from '../../ui/ServerConnectForm';
import { colors } from '../../ui/theme';

export default function ServerScreen() {
  const user = useCurrentUser();
  const isAdmin = user?.role === 'admin';
  const deps = useSyncDeps();
  const st = useSyncStatus();
  const rejected = useData((r) => r.data.outbox.rejected(10));
  const now = useNow(1000);
  const [busy, setBusy] = useState(false);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: number } | null>(null);
  const [devices, setDevices] = useState<{ list: DeviceInfo[]; current: string } | null>(null);

  const run = useCallback(
    async (fn: () => Promise<unknown>, errTitle: string) => {
      setBusy(true);
      try {
        await fn();
      } catch (e) {
        showError(e, e instanceof SyncError && e.kind === 'offline' ? 'Немає звʼязку' : errTitle);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  if (!st.url) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Сервер' }} />
        <Card>
          <T v="h2">Підключення до сервера</T>
          <T v="muted">
            Після підключення записи з усіх телефонів обʼєднуються автоматично, коли є інтернет. Файли .gen
            лишаються запасним способом.
          </T>
        </Card>
        {isAdmin ? (
          <ServerConnectForm
            codeLabel="Код (з журналу сервера — для першого телефона, або одноразовий код від адміна)"
            defaultName={`Телефон ${user?.name ?? ''}`.trim()}
            busy={busy}
            onSubmit={(v) =>
              run(async () => {
                const res = await pairDevice(deps, v.url, v.code, v.name);
                const r = await syncNow(deps);
                Alert.alert(
                  'Підключено',
                  res.kind === 'setup'
                    ? `Сервер налаштовано. Надіслано всі дані з цього телефона.`
                    : `Отримано записів: ${r.pulled}.`,
                );
              }, 'Не вдалося підключитися')
            }
          />
        ) : (
          <Banner level="info" text="Підключає телефон до сервера адміністратор." />
        )}
      </Screen>
    );
  }

  const lastAgo = st.lastSyncAt ? formatDuration(now - st.lastSyncAt) : null;
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Сервер' }} />
      {st.lastError ? <Banner level="danger" text={`Остання спроба: ${st.lastError}`} /> : null}
      <Card accent={st.lastError ? colors.danger : st.pending ? colors.warn : colors.ok}>
        <KV k="Сервер" v={st.url.replace(/^https:\/\//, '')} />
        <KV k="Остання синхронізація" v={st.lastSyncAt ? `${formatTime(st.lastSyncAt)} (${lastAgo} тому)` : 'ще не було'} />
        <KV k="Не відправлено змін" v={String(st.pending)} vColor={st.pending ? colors.warn : undefined} />
        {st.needsSnapshot ? <T v="small">Очікує повного знімка (після імпорту / відновлення) — потрібен вхід адміна.</T> : null}
        <Button
          title="Синхронізувати зараз"
          loading={busy}
          onPress={() =>
            run(async () => {
              const r = await syncNow(deps);
              Alert.alert(
                'Готово',
                `Відправлено: ${r.pushed}, отримано: ${r.pulled}${r.rejected.length ? `, відхилено сервером: ${r.rejected.length}` : ''}`,
              );
            }, 'Синхронізація не вдалася')
          }
        />
      </Card>

      {rejected.length ? (
        <Card style={{ borderColor: colors.warn }}>
          <T v="h2">Відхилено сервером</T>
          <T v="small">Ці зміни не прийнято (немає прав або профіль заблоковано); на телефоні повернуто серверну версію.</T>
          {rejected.map((r) => (
            <T key={r.id}>
              • {formatDateTime(r.at)} — {r.syncError}
            </T>
          ))}
        </Card>
      ) : null}

      {isAdmin ? (
        <Card>
          <T v="h2">Новий телефон</T>
          {pairing && pairing.expiresAt > now ? (
            <View style={{ alignItems: 'center', gap: 6 }}>
              <T v="huge" style={{ letterSpacing: 4 }}>{pairing.code.replace(/(.{4})/, '$1 ')}</T>
              <T v="muted">Дійсний ще {formatDuration(pairing.expiresAt - now, true)} · одноразовий</T>
              <T v="small">
                На новому телефоні: перший запуск → «Підключитися до сервера» → адреса {st.url.replace(/^https:\/\//, '')} і цей код.
              </T>
            </View>
          ) : (
            <Button
              kind="secondary"
              title="Створити код підключення"
              loading={busy}
              onPress={() => run(async () => setPairing(await createPairingCode(deps)), 'Не вдалося створити код')}
            />
          )}
        </Card>
      ) : null}

      {isAdmin ? (
        <Card>
          <T v="h2">Підключені телефони</T>
          {!devices ? (
            <Button
              kind="secondary"
              title="Показати"
              loading={busy}
              onPress={() =>
                run(async () => {
                  const r = await listDevices(deps);
                  setDevices({ list: r.devices, current: r.currentDeviceId });
                }, 'Не вдалося отримати список')
              }
            />
          ) : (
            devices.list.map((d) => (
              <View key={d.id} style={{ gap: 4, paddingVertical: 6 }}>
                <KV
                  k={`${d.name}${d.id === devices.current ? ' (цей)' : ''}`}
                  v={d.revokedAt ? 'відкликано' : d.lastSeenAt ? formatDateTime(d.lastSeenAt) : '—'}
                  vColor={d.revokedAt ? colors.danger : undefined}
                />
                {!d.revokedAt && d.id !== devices.current ? (
                  <Button
                    kind="ghost"
                    title="Відкликати доступ"
                    onPress={async () => {
                      if (!(await confirmAsync('Відкликати доступ?', `«${d.name}» більше не зможе синхронізуватися.`, 'Відкликати', true))) return;
                      run(async () => {
                        await revokeDevice(deps, d.id);
                        const r = await listDevices(deps);
                        setDevices({ list: r.devices, current: r.currentDeviceId });
                      }, 'Не вдалося');
                    }}
                  />
                ) : null}
              </View>
            ))
          )}
        </Card>
      ) : null}

      {isAdmin ? (
        <Button
          kind="ghost"
          title="Відключити цей телефон від сервера"
          onPress={async () => {
            const ok = await confirmAsync(
              'Відключити від сервера?',
              st.pending ? `Є ${st.pending} невідправлених змін — вони лишаться лише на цьому телефоні.` : 'Дані на телефоні лишаться.',
              'Відключити',
              true,
            );
            if (ok) await disconnect(deps);
          }}
        />
      ) : null}
    </Screen>
  );
}
