import { LABELS, PIN_RE, ROLES, type Role } from '@gen/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCurrentUser, useData, useRepos } from '../../../state/AppProvider';
import { AdminOnly } from '../../../ui/AdminOnly';
import { confirmAsync, showError } from '../../../ui/errors';
import { Button, Field, Row, Screen, Segmented, T, Toggle } from '../../../ui/kit';
import { NumPad } from '../../../ui/NumPad';
import { PinDots } from '../../../ui/PinPad';
import { TextField } from '../../../ui/TextField';
import { colors, size } from '../../../ui/theme';

export default function UserEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const repos = useRepos();
  const me = useCurrentUser();
  const existing = useData((r) => (id ? r.users.get(id) : undefined), [id]);
  const [name, setName] = useState(existing?.name ?? '');
  const [role, setRole] = useState<Role>(existing?.role ?? 'operator');
  const [isActive, setActive] = useState(existing?.isActive ?? true);
  const [pin, setPin] = useState<string | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      if (existing) {
        repos.users.update(existing.id, { name: name.trim(), role, isActive });
        if (pin) await repos.users.changePin(existing.id, pin);
      } else {
        if (!pin) return Alert.alert('PIN', 'Задайте PIN для нового профілю');
        await repos.users.create({ name: name.trim(), role, pin });
      }
      router.back();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    if (!(await confirmAsync('Видалити профіль?', `«${existing.name}» більше не зможе увійти. Записи цього профілю лишаться.`, 'Видалити', true))) return;
    try {
      repos.users.remove(existing.id);
      router.back();
    } catch (e) {
      showError(e);
    }
  };

  return (
    <AdminOnly>
      <Screen>
        <Stack.Screen options={{ title: existing ? existing.name : 'Новий профіль' }} />
        <Field label="Імʼя або позивний">
          <TextField value={name} onChangeText={setName} maxLength={40} autoFocus={!existing} />
        </Field>
        <Field label="Роль">
          <Segmented value={role} onChange={setRole} options={ROLES.map((r) => ({ value: r, label: LABELS.role[r] }))} />
        </Field>
        <T v="small">
          {role === 'admin'
            ? 'Адмін: усе, включно з профілями, генераторами, імпортом і відновленням.'
            : 'Оператор: вносить сесії, заправки, ТО, надходження; змінює свої записи протягом доби.'}
        </T>
        {existing ? <Toggle label="Активний (може входити)" value={isActive} onChange={setActive} /> : null}
        <Button
          kind="secondary"
          title={pin ? 'PIN задано ✓ (змінити)' : existing ? 'Змінити PIN' : 'Задати PIN'}
          onPress={() => setPinOpen(true)}
        />
        <View style={{ flex: 1 }} />
        <Button large title="Зберегти" loading={busy} disabled={!name.trim()} onPress={save} />
        {existing && existing.id !== me?.id ? <Button kind="ghost" title="Видалити профіль" onPress={remove} /> : null}
      </Screen>
      <PinModal
        visible={pinOpen}
        onClose={() => setPinOpen(false)}
        onDone={(p) => {
          setPin(p);
          setPinOpen(false);
        }}
      />
    </AdminOnly>
  );
}

function PinModal({ visible, onClose, onDone }: { visible: boolean; onClose: () => void; onDone: (p: string) => void }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const reset = () => {
    setA('');
    setB('');
    setStep(1);
  };
  const submit = () => {
    if (step === 1) {
      if (!PIN_RE.test(a)) return Alert.alert('PIN', '4–6 цифр');
      return setStep(2);
    }
    if (a !== b) {
      setB('');
      return Alert.alert('PIN не збігається', 'Введіть ще раз');
    }
    onDone(a);
    reset();
  };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, padding: size.pad, gap: size.gap }}>
        <T v="h2">{step === 1 ? 'Новий PIN' : 'Повторіть PIN'}</T>
        <PinDots length={(step === 1 ? a : b).length} />
        <View style={{ flex: 1 }} />
        <NumPad value={step === 1 ? a : b} onChange={step === 1 ? setA : setB} decimals={0} maxLength={6} onSubmit={submit} />
        <Row>
          <Button kind="ghost" title="Скасувати" onPress={() => { reset(); onClose(); }} />
        </Row>
      </SafeAreaView>
    </Modal>
  );
}
