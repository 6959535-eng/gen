import { formatDuration, formatTime, isClockSuspicious, LABELS, type User } from '@gen/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, View } from 'react-native';
import { useData, useNow, useRepos } from '../state/AppProvider';
import { usePendingFile } from '../state/pendingFile';
import { useSession } from '../state/session';
import { showError } from '../ui/errors';
import { Button, Card, Screen, T } from '../ui/kit';
import { NumPad } from '../ui/NumPad';
import { PinDots } from '../ui/PinPad';
import { colors } from '../ui/theme';

export default function Login() {
  const repos = useRepos();
  const users = useData((r) => r.users.list());
  const signIn = useSession((s) => s.signIn);
  const [selected, setSelected] = useState<User | null>(null);
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const now = useNow(1000);

  // Перевірка годинника телефона — один раз при показі екрана
  useEffect(() => {
    const latest = repos.data.latestRecordAt();
    if (isClockSuspicious(Date.now(), latest)) {
      Alert.alert(
        'Перевірте час на телефоні',
        'Час телефона раніший за останній запис у базі. Записи можуть отримати неправильну дату. Налаштуйте дату й час у системі.',
      );
    }
  }, [repos]);

  const choose = (u: User) => {
    setSelected(u);
    setPin('');
    setMessage(null);
    const l = repos.users.lockState(u.id);
    setLockUntil(l.lockUntil && l.lockUntil > Date.now() ? l.lockUntil : null);
  };

  const submit = async () => {
    if (!selected || pin.length < 4 || busy) return;
    setBusy(true);
    try {
      const r = await repos.users.verify(selected.id, pin);
      setPin('');
      if (r.ok) {
        signIn(r.user);
        // Під головною не має лишатися стек входу / першого запуску
        if (router.canDismiss()) router.dismissAll();
        const pending = usePendingFile.getState().uri;
        if (pending && r.user.role === 'admin') {
          usePendingFile.getState().set(null);
          router.replace({ pathname: '/import', params: { uri: pending } });
        } else {
          if (pending) Alert.alert('Імпорт файла', 'Імпортувати дані може лише адміністратор.');
          usePendingFile.getState().set(null);
          router.replace('/home');
        }
        return;
      }
      if (r.reason === 'locked') setLockUntil(r.lockUntil);
      else if (r.reason === 'wrong') {
        if (r.lockUntil) {
          setLockUntil(r.lockUntil);
          setMessage('Забагато невірних спроб');
        } else setMessage(`Невірний PIN. Лишилось спроб: ${r.attemptsLeft}`);
      } else setMessage(r.reason === 'inactive' ? 'Профіль заблоковано адміністратором' : 'Профіль не знайдено');
    } catch (e) {
      showError(e, 'Помилка входу');
    } finally {
      setBusy(false);
    }
  };

  if (!selected) {
    return (
      <Screen scroll={false}>
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ gap: 12 }}
          renderItem={({ item }) => (
            <Card onPress={() => choose(item)} accent={item.role === 'admin' ? colors.accent : colors.info}>
              <T v="h2" style={{ fontSize: 26 }}>{item.name}</T>
              <T v="muted">{LABELS.role[item.role]}</T>
            </Card>
          )}
          ListEmptyComponent={<T v="muted">Немає активних профілів. Зверніться до адміністратора.</T>}
        />
      </Screen>
    );
  }

  const locked = lockUntil !== null && lockUntil > now;
  return (
    <Screen>
      <T v="title">{selected.name}</T>
      {locked ? (
        <Card style={{ borderColor: colors.danger }}>
          <T v="h2" style={{ color: colors.danger }}>Профіль тимчасово заблоковано</T>
          <T>
            Спробуйте о {formatTime(lockUntil!)} (через {formatDuration(lockUntil! - now, true)})
          </T>
        </Card>
      ) : (
        <>
          <T v="muted">Введіть PIN</T>
          <PinDots length={pin.length} error={!!message && pin.length === 0} />
          {message ? <T style={{ color: colors.danger, textAlign: 'center' }}>{message}</T> : null}
        </>
      )}
      <View style={{ flex: 1 }} />
      {!locked ? (
        <NumPad value={pin} onChange={(v) => { setPin(v); setMessage(null); }} decimals={0} maxLength={6} onSubmit={submit} submitLabel="Увійти" />
      ) : null}
      <Button kind="ghost" title="← Інший профіль" onPress={() => setSelected(null)} />
    </Screen>
  );
}
