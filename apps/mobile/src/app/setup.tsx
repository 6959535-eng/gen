import { PIN_RE } from '@gen/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { pickGenFile } from '../services/platform';
import { useRepos } from '../state/AppProvider';
import { usePendingFile } from '../state/pendingFile';
import { useSession } from '../state/session';
import { showError } from '../ui/errors';
import { Button, Card, Field, Screen, T } from '../ui/kit';
import { PinDots } from '../ui/PinPad';
import { NumPad } from '../ui/NumPad';
import { TextField } from '../ui/TextField';

type Step = 'choice' | 'name' | 'pin' | 'pin2';

export default function Setup() {
  const repos = useRepos();
  const signIn = useSession((s) => s.signIn);
  const [step, setStep] = useState<Step>('choice');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);

  if (step === 'choice') {
    return (
      <Screen>
        <T v="title">Облік генераторів</T>
        <T v="muted">
          Дані зберігаються лише на цьому телефоні. Якщо у команди вже є база на іншому телефоні — імпортуйте її файл,
          щоб не створювати окрему.
        </T>
        <Card>
          <T v="h2">Нова база</T>
          <T v="muted">Цей телефон — перший. Ви станете адміністратором.</T>
          <Button large title="Створити нову базу" onPress={() => setStep('name')} />
        </Card>
        <Card>
          <T v="h2">Уже є база на іншому телефоні</T>
          <T v="muted">Попросіть адміна зробити експорт і надіслати файл .gen.</T>
          <Button
            kind="secondary"
            large
            title="Імпортувати з файла"
            onPress={async () => {
              const f = await pickGenFile();
              if (!f) return;
              usePendingFile.getState().setPicked(f);
              router.push('/import-first');
            }}
          />
        </Card>
      </Screen>
    );
  }

  if (step === 'name') {
    return (
      <Screen>
        <Field label="Імʼя або позивний адміністратора">
          <TextField value={name} onChangeText={setName} placeholder="Напр., Сокіл" autoFocus maxLength={40} />
        </Field>
        <View style={{ flex: 1 }} />
        <Button large title="Далі" disabled={!name.trim()} onPress={() => setStep('pin')} />
        <Button kind="ghost" title="Назад" onPress={() => setStep('choice')} />
      </Screen>
    );
  }

  const isRepeat = step === 'pin2';
  const value = isRepeat ? pin2 : pin;
  const setValue = isRepeat ? setPin2 : setPin;
  const submit = async () => {
    if (!isRepeat) {
      if (!PIN_RE.test(pin)) return Alert.alert('PIN', 'PIN має містити від 4 до 6 цифр');
      return setStep('pin2');
    }
    if (pin2 !== pin) {
      setPin2('');
      return Alert.alert('PIN не збігається', 'Введіть той самий PIN ще раз');
    }
    setBusy(true);
    try {
      const u = await repos.users.createFirstAdmin(name.trim(), pin);
      signIn(u);
      router.replace('/home');
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <T v="h2">{isRepeat ? 'Повторіть PIN' : `PIN для «${name.trim()}»`}</T>
      <T v="muted">4–6 цифр. Його вводитимете щоразу при вході.</T>
      <PinDots length={value.length} />
      <View style={{ flex: 1 }} />
      <NumPad value={value} onChange={setValue} decimals={0} maxLength={6} onSubmit={submit} submitLabel="OK" />
      <Button kind="ghost" title="Назад" disabled={busy} onPress={() => { setPin(''); setPin2(''); setStep('name'); }} />
    </Screen>
  );
}
