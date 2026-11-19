import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../state/session';
import { colors, size } from './theme';

/**
 * Власна цифрова клавіатура: великі клавіші (≈72 dp), десяткова кома, без системної клавіатури.
 * value — рядок у вигляді, як його бачить людина («12,5»).
 */
export function NumPad({
  value,
  onChange,
  decimals = 1,
  maxLength = 7,
  onSubmit,
  submitLabel,
  keyHeight = 72,
}: {
  value: string;
  onChange: (v: string) => void;
  decimals?: number;
  maxLength?: number;
  onSubmit?: () => void;
  submitLabel?: string;
  keyHeight?: number;
}) {
  const press = (k: string) => {
    Haptics.selectionAsync().catch(() => {});
    useSession.getState().touch();
    if (k === '⌫') return onChange(value.slice(0, -1));
    if (k === ',') {
      if (decimals === 0 || value.includes(',')) return;
      return onChange(value === '' ? '0,' : `${value},`);
    }
    if (value.length >= maxLength) return;
    const [, frac] = value.split(',');
    if (frac !== undefined && frac.length >= decimals) return;
    if (value === '0' && k !== ',') return onChange(k);
    onChange(value + k);
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', decimals > 0 ? ',' : '', '0', '⌫'];
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.grid}>
        {keys.map((k, i) =>
          k === '' ? (
            onSubmit ? (
              <Key key={i} label={submitLabel ?? 'OK'} onPress={onSubmit} accent h={keyHeight} />
            ) : (
              <View key={i} style={[styles.keyEmpty, { height: keyHeight }]} />
            )
          ) : (
            <Key key={i} label={k} onPress={() => press(k)} h={keyHeight} />
          ),
        )}
      </View>
    </View>
  );
}

function Key({ label, onPress, accent, h }: { label: string; onPress: () => void; accent?: boolean; h: number }) {
  return (
    <Pressable
      accessibilityRole="keyboardkey"
      accessibilityLabel={label === '⌫' ? 'Стерти' : label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.key,
        { height: h },
        accent && { backgroundColor: colors.accent, borderColor: colors.accent },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Text style={{ color: accent ? colors.accentText : colors.text, fontSize: 30, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  key: {
    width: '31.8%',
    flexGrow: 1,
    height: 72,
    borderRadius: size.radius,
    backgroundColor: colors.surface2,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyEmpty: { width: '31.8%', flexGrow: 1, height: 72 },
});

/** «12,5» → 12.5 (null — порожньо) */
export function numFromInput(s: string): number | null {
  if (s === '' || s === ',') return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** 12.5 → «12,5» */
export function inputFromNum(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined) return '';
  const f = 10 ** decimals;
  return String(Math.round(n * f) / f).replace('.', ',');
}
