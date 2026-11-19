import * as Haptics from 'expo-haptics';
import { Children, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../state/session';
import { colors, size } from './theme';

export function Screen({ children, scroll = true, padded = true }: { children: ReactNode; scroll?: boolean; padded?: boolean }) {
  const inner = <View style={[padded && { padding: size.pad, gap: size.gap }, { flexGrow: 1 }]}>{children}</View>;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom', 'left', 'right']}>
      {scroll ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

type TVariant = 'body' | 'title' | 'h2' | 'muted' | 'small' | 'huge';
const tStyles: Record<TVariant, TextStyle> = {
  body: { fontSize: size.font, color: colors.text },
  title: { fontSize: 26, fontWeight: '700', color: colors.text },
  h2: { fontSize: size.fontLarge, fontWeight: '700', color: colors.text },
  muted: { fontSize: 16, color: colors.muted },
  small: { fontSize: 14, color: colors.muted },
  huge: { fontSize: size.fontHuge, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
};
export function T({ v = 'body', style, children, numberOfLines }: {
  v?: TVariant;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
}) {
  return (
    <Text style={[tStyles[v], style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

type BtnKind = 'primary' | 'secondary' | 'ok' | 'danger' | 'ghost';
const btnColors: Record<BtnKind, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.accent, fg: colors.accentText },
  secondary: { bg: colors.surface2, fg: colors.text, border: colors.border },
  ok: { bg: colors.ok, fg: '#03170a' },
  danger: { bg: colors.danger, fg: '#fff' },
  ghost: { bg: 'transparent', fg: colors.text, border: colors.border },
};

export function Button({
  title,
  onPress,
  kind = 'primary',
  large,
  disabled,
  loading,
  style,
  subtitle,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  kind?: BtnKind;
  large?: boolean;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  subtitle?: string;
  accessibilityLabel?: string;
}) {
  const c = btnColors[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      disabled={disabled || loading}
      onPress={() => {
        useSession.getState().touch();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.btn,
        {
          minHeight: large ? size.touchLarge : size.touch,
          backgroundColor: c.bg,
          borderColor: c.border ?? c.bg,
          opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={c.fg} />
      ) : (
        <>
          <Text style={{ color: c.fg, fontSize: large ? 24 : 20, fontWeight: '700', textAlign: 'center' }}>{title}</Text>
          {subtitle ? <Text style={{ color: c.fg, opacity: 0.8, fontSize: 14, textAlign: 'center' }}>{subtitle}</Text> : null}
        </>
      )}
    </Pressable>
  );
}

/** Рядок рівних за шириною елементів (кнопки, сегменти). */
export function Row({ children, style, gap = size.gap }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return (
    <View style={[{ flexDirection: 'row', gap, alignItems: 'stretch' }, style]}>
      {Children.toArray(children).map((c, i) => (
        <View key={i} style={{ flex: 1 }}>
          {c}
        </View>
      ))}
    </View>
  );
}

export function Card({ children, style, onPress, accent }: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accent?: string;
}) {
  const body = (
    <View style={[styles.card, accent ? { borderLeftWidth: 6, borderLeftColor: accent } : null, style]}>{children}</View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      {body}
    </Pressable>
  );
}

export function Pill({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, alignSelf: 'flex-start' }}>
      <Text style={{ color, fontWeight: '700', fontSize: 14 }}>{text}</Text>
    </View>
  );
}

const bannerColors = {
  danger: { bg: colors.dangerDark, fg: '#fecaca', bar: colors.danger },
  warn: { bg: colors.warnDark, fg: '#fde68a', bar: colors.warn },
  info: { bg: colors.infoDark, fg: '#bfdbfe', bar: colors.info },
} as const;
export function Banner({ level, text, action }: {
  level: keyof typeof bannerColors;
  text: string;
  action?: { title: string; onPress: () => void };
}) {
  const c = bannerColors[level];
  return (
    <View style={[styles.banner, { backgroundColor: c.bg, borderLeftColor: c.bar }]}>
      <Text style={{ color: c.fg, fontSize: 16, flex: 1 }}>{text}</Text>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={10} style={{ paddingHorizontal: 8, justifyContent: 'center', minHeight: 44 }}>
          <Text style={{ color: c.fg, fontWeight: '700', fontSize: 16, textDecorationLine: 'underline' }}>{action.title}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Сегментований перемикач з великими кнопками. */
export function Segmented<V extends string>({ value, options, onChange }: {
  value: V;
  options: readonly { value: V; label: string }[];
  onChange: (v: V) => void;
}) {
  return (
    <Row gap={8}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.seg, active && { backgroundColor: colors.accent, borderColor: colors.accent }]}
          >
            <Text style={{ color: active ? colors.accentText : colors.text, fontSize: 18, fontWeight: '700' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </Row>
  );
}

/** Великий перемикач так/ні. */
export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={[styles.toggle, value && { borderColor: colors.ok }]}
    >
      <View style={[styles.check, value && { backgroundColor: colors.ok, borderColor: colors.ok }]}>
        {value ? <Text style={{ color: '#03170a', fontSize: 22, fontWeight: '900' }}>✓</Text> : null}
      </View>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '600', flex: 1 }}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && { backgroundColor: colors.accent, borderColor: colors.accent }]}
      hitSlop={4}
    >
      <Text style={{ color: active ? colors.accentText : colors.text, fontSize: 16, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <T v="muted">{label}</T>
      {children}
      {hint ? <T v="small">{hint}</T> : null}
    </View>
  );
}

/** Рядок «назва — значення». */
export function KV({ k, v, vColor }: { k: string; v: string; vColor?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
      <T v="muted">{k}</T>
      <T style={[{ fontWeight: '600', fontVariant: ['tabular-nums'] }, vColor ? { color: vColor } : null]}>{v}</T>
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <View style={{ padding: 24, alignItems: 'center' }}>
      <T v="muted" style={{ textAlign: 'center' }}>
        {text}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: size.radius,
    borderWidth: 2,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: size.radius,
    padding: size.pad,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  banner: {
    flexDirection: 'row',
    borderRadius: 10,
    borderLeftWidth: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
    alignItems: 'center',
  },
  seg: {
    minHeight: size.touch,
    borderRadius: size.radius,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: size.touch,
    paddingHorizontal: 14,
    borderRadius: size.radius,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  check: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/** Вибір одного варіанта з великих «плиток», що переносяться на кілька рядків. */
export function Choice<V extends string>({ value, options, onChange }: {
  value: V;
  options: readonly { value: V; label: string }[];
  onChange: (v: V) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.seg, { flexGrow: 1, minWidth: '45%' }, active && { backgroundColor: colors.accent, borderColor: colors.accent }]}
          >
            <Text style={{ color: active ? colors.accentText : colors.text, fontSize: 18, fontWeight: '700' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Пункт меню (адмінка): велика плитка з підписом. */
export function MenuItem({ title, subtitle, onPress, badge }: {
  title: string;
  subtitle?: string;
  onPress: () => void;
  badge?: string;
}) {
  return (
    <Card onPress={onPress} style={{ minHeight: 76, justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="h2">{title}</T>
          {subtitle ? <T v="muted">{subtitle}</T> : null}
        </View>
        {badge ? <Pill text={badge} color="#fff" bg={colors.danger} /> : null}
        <T v="h2" style={{ color: colors.muted }}>›</T>
      </View>
    </Card>
  );
}
