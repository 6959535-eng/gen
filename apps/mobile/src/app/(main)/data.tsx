import { DAY, formatDateTime, MIN_PASSWORD_LENGTH } from '@gen/shared';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import {
  createExport,
  createManualBackup,
  listLocalBackups,
  teamPassword,
  type LocalBackup,
} from '../../services/backupCore';
import { canSaveToFolder, files, pickGenFile, saveToFolder, secrets, shareFile } from '../../services/platform';
import { useCurrentUser, useData } from '../../state/AppProvider';
import { useBackupDeps } from '../../state/backupDeps';
import { usePendingFile } from '../../state/pendingFile';
import { useSyncStatus } from '../../state/sync';
import { showError } from '../../ui/errors';
import { Banner, Button, Card, Field, KV, Row, Screen, T } from '../../ui/kit';
import { TextField } from '../../ui/TextField';
import { colors } from '../../ui/theme';

const KIND: Record<LocalBackup['kind'], string> = { 'auto-backup': 'Автоматична', backup: 'Ручна', export: 'Експорт' };

export default function DataScreen() {
  const user = useCurrentUser();
  const isAdmin = user?.role === 'admin';
  const [progress, setProgress] = useState<number | null>(null);
  const deps = useBackupDeps(useCallback((p: number) => setProgress(p), []));
  const lastManual = useData((r) => r.local.get('last_manual_backup_at'));
  const lastAuto = useData((r) => r.local.get('last_auto_backup_at'));
  const reminderDays = useData((r) => r.settings.get().backupReminderDays);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [backups, setBackups] = useState<LocalBackup[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const serverOn = useData((r) => !!r.local.get('server_url'));

  useFocusEffect(
    useCallback(() => {
      teamPassword.get(secrets).then((p) => setHasPassword(!!p));
      listLocalBackups(files).then(setBackups);
    }, []),
  );

  const withPassword = async (fn: (pwd: string) => Promise<void>, what: string) => {
    const pwd = await teamPassword.get(secrets);
    if (!pwd) {
      return Alert.alert('Немає пароля команди', isAdmin ? 'Спершу задайте пароль команди нижче.' : 'Попросіть адміна задати пароль команди на цьому телефоні.');
    }
    setBusy(what);
    setProgress(0);
    try {
      await fn(pwd);
    } catch (e) {
      showError(e, 'Не вдалося');
    } finally {
      setBusy(null);
      setProgress(null);
      listLocalBackups(files).then(setBackups);
    }
  };

  const overdue = !lastManual || Date.now() - Number(lastManual) > reminderDays * DAY;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Дані' }} />
      {busy ? (
        <Banner level="info" text={`${busy}… ${progress !== null ? Math.round(progress * 100) + '%' : ''}`} />
      ) : null}

      <ServerLink />

      <Card accent={overdue ? colors.warn : colors.ok}>
        <T v="h2">Резервна копія</T>
        <KV k="Остання ручна" v={lastManual ? formatDateTime(Number(lastManual)) : 'не було'} vColor={overdue ? colors.warn : undefined} />
        <KV k="Остання автоматична" v={lastAuto ? formatDateTime(Number(lastAuto)) : 'не було'} />
        <T v="small">Зашифрована паролем команди. Надішліть її собі або в групу — щоб дані пережили втрату телефона.</T>
        <Button
          large
          title="Створити резервну копію"
          disabled={!!busy}
          onPress={() =>
            withPassword(async (pwd) => {
              const f = await createManualBackup(deps, pwd);
              await shareFile(f.bytes, f.fileName);
            }, 'Створення копії')
          }
        />
      </Card>

      <Card>
        <T v="h2">Перенести на інший телефон</T>
        <T v="small">Файл .gen з усіма записами, профілями й налаштуваннями, зашифрований паролем команди.</T>
        <Row>
          <Button
            title="Поділитися"
            disabled={!!busy}
            onPress={() =>
              withPassword(async (pwd) => {
                const f = await createExport(deps, pwd);
                await shareFile(f.bytes, f.fileName);
              }, 'Експорт')
            }
          />
          {canSaveToFolder ? (
            <Button
              kind="secondary"
              title="У папку"
              subtitle="напр. Завантаження"
              disabled={!!busy}
              onPress={() =>
                withPassword(async (pwd) => {
                  const f = await createExport(deps, pwd);
                  if (await saveToFolder(f.bytes, f.fileName)) Alert.alert('Збережено', f.fileName);
                }, 'Експорт')
              }
            />
          ) : null}
        </Row>
        {isAdmin ? (
          <Button
            kind="secondary"
            title="Імпортувати файл з іншого телефона"
            disabled={!!busy}
            onPress={async () => {
              const f = await pickGenFile();
              if (!f) return;
              usePendingFile.getState().setPicked(f);
              router.push('/import');
            }}
          />
        ) : null}
      </Card>

      {isAdmin ? <TeamPassword has={hasPassword} onChanged={() => setHasPassword(true)} /> : null}

      {isAdmin ? (
        <Card>
          <T v="h2">Відновлення з копії</T>
          <T v="small">Повністю замінює всі дані на телефоні. Перед цим автоматично зберігається копія поточного стану.</T>
          {serverOn ? (
            <Banner level="warn" text="Телефон підключено до сервера: після відновлення новіші записи з сервера повернуться під час синхронізації. Відновлення потрібне здебільшого, якщо втрачено сам сервер." />
          ) : null}
          <Button
            kind="secondary"
            title="Обрати файл копії…"
            onPress={async () => {
              const f = await pickGenFile();
              if (!f) return;
              usePendingFile.getState().setPicked(f);
              router.push('/restore');
            }}
          />
          <T v="muted" style={{ marginTop: 6 }}>Копії на цьому телефоні:</T>
          {backups.length === 0 ? <T v="small">Ще немає</T> : null}
          {backups.map((b) => (
            <Button
              key={b.name}
              kind="ghost"
              title={`${KIND[b.kind]} · ${fileDate(b.name)}`}
              onPress={() => router.push({ pathname: '/restore', params: { path: b.path } })}
            />
          ))}
        </Card>
      ) : null}
      <Button kind="ghost" title="Про додаток і оновлення" onPress={() => router.push('/about')} />
      <View style={{ height: 12 }} />
    </Screen>
  );
}

function fileDate(name: string): string {
  const m = /-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(name);
  return m ? `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}` : name;
}

function TeamPassword({ has, onChanged }: { has: boolean | null; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  return (
    <Card>
      <T v="h2">Пароль команди</T>
      <T v="small">
        Ним шифруються файли експорту й резервні копії. Однаковий на всіх телефонах команди; зберігається в захищеному сховищі
        телефона. Без нього файл не відкрити — запишіть його в надійне місце.
      </T>
      <KV k="Стан" v={has ? 'задано ✓' : 'не задано'} vColor={has ? colors.ok : colors.warn} />
      {!open ? (
        <Button kind="secondary" title={has ? 'Змінити пароль' : 'Задати пароль'} onPress={() => setOpen(true)} />
      ) : (
        <>
          <Field label={`Пароль (від ${MIN_PASSWORD_LENGTH} символів)`}>
            <TextField value={a} onChangeText={setA} secure maxLength={200} placeholder="Новий пароль" />
          </Field>
          <Field label="Ще раз">
            <TextField value={b} onChangeText={setB} secure maxLength={200} placeholder="Повторіть пароль" />
          </Field>
          {has ? <T v="small">Старі файли відкриватимуться старим паролем — його спитають при імпорті.</T> : null}
          <Row>
            <Button kind="ghost" title="Скасувати" onPress={() => setOpen(false)} />
            <Button
              title="Зберегти"
              disabled={a.length < MIN_PASSWORD_LENGTH || a !== b}
              onPress={async () => {
                await teamPassword.set(secrets, a);
                setOpen(false);
                setA('');
                setB('');
                onChanged();
              }}
            />
          </Row>
          {a && b && a !== b ? <T style={{ color: colors.danger }}>Паролі не збігаються</T> : null}
        </>
      )}
    </Card>
  );
}

function ServerLink() {
  const st = useSyncStatus();
  return (
    <Card onPress={() => router.push('/server')} accent={!st.url ? colors.border : st.lastError ? colors.danger : colors.ok}>
      <T v="h2">Сервер ›</T>
      <T v="muted">
        {!st.url
          ? 'Не підключено — дані лише на цьому телефоні'
          : st.lastError
            ? `Помилка: ${st.lastError}`
            : `Підключено · ${st.lastSyncAt ? `синхронізовано ${formatDateTime(st.lastSyncAt)}` : 'ще не синхронізовано'}${st.pending ? ` · не відправлено: ${st.pending}` : ''}`}
      </T>
    </Card>
  );
}
