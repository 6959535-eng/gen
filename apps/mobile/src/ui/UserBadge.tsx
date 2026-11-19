import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { useCurrentUser } from '../state/AppProvider';
import { useSession } from '../state/session';
import { colors } from './theme';

/** Кнопка в заголовку: імʼя поточного користувача + «Змінити». */
export function UserBadge() {
  const user = useCurrentUser();
  const signOut = useSession((s) => s.signOut);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Змінити користувача"
      hitSlop={10}
      onPress={() => {
        signOut();
        router.replace('/login');
      }}
      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border }}
    >
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>
        {user?.name ?? '—'} · Змінити
      </Text>
    </Pressable>
  );
}
