import { formatDateTime } from '@gen/shared';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import {
  applyOtaUpdate,
  checkApk,
  downloadAndInstallApk,
  fetchOtaUpdate,
  nativeVersion,
  otaInfo,
  serverBase,
  type ApkInfo,
} from '../../services/appUpdates';
import { useData } from '../../state/AppProvider';
import { showError } from '../../ui/errors';
import { Banner, Button, Card, KV, Screen, T } from '../../ui/kit';

/** Про додаток: версії, перевірка оновлень. */
export default function About() {
  const serverUrl = useData((r) => r.local.get('server_url') || null);
  const base = serverBase(serverUrl);
  const ota = otaInfo();
  const [busy, setBusy] = useState<string | null>(null);
  const [otaReady, setOtaReady] = useState(false);
  const [apk, setApk] = useState<ApkInfo | null>(null);
  const [checked, setChecked] = useState(false);

  const check = async () => {
    setBusy('check');
    try {
      const [ready, a] = await Promise.all([fetchOtaUpdate().catch(() => false), checkApk(base)]);
      setOtaReady(ready);
      setApk(a);
      setChecked(true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Про додаток' }} />
      <Card>
        <T v="h2">Облік генераторів</T>
        <KV k="Версія APK" v={`${nativeVersion.name} (${nativeVersion.code})`} />
        <KV
          k="Оновлення по повітрю"
          v={!ota.enabled ? 'вимкнено (розробка)' : ota.isEmbedded || !ota.createdAt ? 'вбудована версія' : formatDateTime(ota.createdAt.getTime())}
        />
        {ota.message ? <T v="small">{ota.message}</T> : null}
        <KV k="Сервер оновлень" v={base.replace(/^https:\/\//, '') || '—'} />
      </Card>

      {otaReady ? (
        <Card>
          <T v="h2">Оновлення завантажено</T>
          <T v="muted">Застосується при наступному запуску. Можна перезапустити зараз — дані не зміняться.</T>
          <Button title="Перезапустити зараз" onPress={() => applyOtaUpdate()} />
        </Card>
      ) : null}

      {apk ? (
        <Card>
          <T v="h2">Нова версія додатка {apk.versionName}</T>
          {apk.notes ? <T v="muted">{apk.notes}</T> : null}
          <T v="small">Буде завантажено ≈ 50 МБ. Android попросить підтвердити встановлення; дані збережуться.</T>
          <Button
            title="Завантажити й встановити"
            loading={busy === 'apk'}
            onPress={async () => {
              setBusy('apk');
              try {
                await downloadAndInstallApk(base, apk);
              } catch (e) {
                showError(e, 'Не вдалося встановити');
              } finally {
                setBusy(null);
              }
            }}
          />
        </Card>
      ) : null}

      {checked && !otaReady && !apk ? <Banner level="info" text="У вас остання версія ✓" /> : null}
      <Button kind="secondary" title="Перевірити оновлення" loading={busy === 'check'} onPress={check} />
      <T v="small">
        Оновлення перевіряються самі, коли є інтернет. Кожне оновлення підписане ключем команди — чужих оновлень
        телефон не прийме.
      </T>
      {!ota.enabled ? null : (
        <Button kind="ghost" title="Що таке «вбудована версія»?" onPress={() => Alert.alert('Вбудована версія', 'Додаток працює з тим кодом, що був у встановленому APK; оновлень по повітрю ще не отримував.')} />
      )}
    </Screen>
  );
}
