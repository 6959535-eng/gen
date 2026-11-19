import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Row, T } from './kit';
import { inputFromNum, numFromInput, NumPad } from './NumPad';
import { colors, size } from './theme';

/** Поле з числом: тап відкриває велику клавіатуру на весь екран. */
export function NumberField({
  label,
  value,
  onChange,
  unit,
  decimals = 1,
  placeholder = 'не вказано',
  hint,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  unit?: string;
  decimals?: number;
  placeholder?: string;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => {
          setDraft(inputFromNum(value, decimals));
          setOpen(true);
        }}
        style={{
          minHeight: size.touch,
          borderRadius: size.radius,
          borderWidth: 2,
          borderColor: colors.border,
          backgroundColor: colors.surface2,
          paddingHorizontal: 14,
          justifyContent: 'center',
        }}
      >
        <T v="small">{label}</T>
        <Text style={{ color: value === null ? colors.muted : colors.text, fontSize: 22, fontWeight: '700' }}>
          {value === null ? placeholder : `${inputFromNum(value, decimals)}${unit ? ` ${unit}` : ''}`}
        </Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, padding: size.pad, gap: size.gap }}>
          <T v="h2">{label}</T>
          {hint ? <T v="muted">{hint}</T> : null}
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <T v="huge" style={{ textAlign: 'center', fontSize: 56 }}>
              {draft || '0'}
              {unit ? <T v="muted" style={{ fontSize: 28 }}> {unit}</T> : null}
            </T>
          </View>
          <NumPad value={draft} onChange={setDraft} decimals={decimals} />
          <Row>
            <Button
              kind="secondary"
              title="Очистити"
              onPress={() => {
                onChange(null);
                setOpen(false);
              }}
            />
            <Button
              title="Готово"
              onPress={() => {
                onChange(numFromInput(draft));
                setOpen(false);
              }}
            />
          </Row>
        </SafeAreaView>
      </Modal>
    </>
  );
}
