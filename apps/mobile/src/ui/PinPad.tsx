import { View } from 'react-native';
import { colors } from './theme';

export function PinDots({ length, max = 6, error }: { length: number; max?: number; error?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'center', paddingVertical: 16 }}>
      {Array.from({ length: max }, (_, i) => (
        <View
          key={i}
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: 2,
            borderColor: error ? colors.danger : colors.muted,
            backgroundColor: i < length ? (error ? colors.danger : colors.accent) : 'transparent',
            opacity: i < 4 || i < length ? 1 : 0.35,
          }}
        />
      ))}
    </View>
  );
}
