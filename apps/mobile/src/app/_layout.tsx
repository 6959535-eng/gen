import '../polyfills';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../state/AppProvider';
import { T } from '../ui/kit';
import { colors } from '../ui/theme';

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.surface, text: colors.text, primary: colors.accent, border: colors.border },
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <AppProvider
          fallback={
            <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator size="large" color={colors.accent} />
            </View>
          }
          renderError={(e) => (
            <View style={{ flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: 'center', gap: 12 }}>
              <T v="title">Не вдалося відкрити базу даних</T>
              <T v="muted">{e.message}</T>
              <T v="muted">Дані не видалено. Перезапустіть додаток; якщо не допоможе — зверніться до адміністратора.</T>
            </View>
          )}
        >
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.surface },
              headerTintColor: colors.text,
              headerTitleStyle: { fontSize: 20, fontWeight: '700' },
              contentStyle: { backgroundColor: colors.bg },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="setup" options={{ title: 'Перший запуск', headerBackVisible: false }} />
            <Stack.Screen name="login" options={{ title: 'Хто працює?', headerBackVisible: false }} />
            <Stack.Screen name="import-first" options={{ title: 'Імпорт бази' }} />
            <Stack.Screen name="(main)" options={{ headerShown: false }} />
          </Stack>
        </AppProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
