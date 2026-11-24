import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { SessionProvider } from '@/src/api/SessionContext';
import { syncDirection, t } from '@/src/i18n';
import { mode, theme } from '@/src/theme';
import { UnitProvider } from '@/src/UnitContext';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  anchor: '(tabs)',
};

// Arabic is right-to-left: make the layout direction match the chosen language.
syncDirection();

const base = mode === 'light' ? DefaultTheme : DarkTheme;
const navTheme = {
  ...base,
  colors: {
    ...base.colors,
    background: theme.bg,
    card: theme.card,
    border: theme.border,
    primary: theme.accent,
    text: theme.text,
  },
};

export default function RootLayout() {
  return (
    <SessionProvider>
      <UnitProvider>
        <ThemeProvider value={navTheme}>
          <StatusBar style={mode === 'light' ? 'dark' : 'light'} />
          <Stack screenOptions={{ headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text, headerShadowVisible: false, headerBackButtonDisplayMode: 'minimal' }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="exercise/[id]" options={{ title: t('Exercise') }} />
            <Stack.Screen name="workout/[id]" options={{ title: t('Workout') }} />
            <Stack.Screen name="routine/[id]" options={{ title: t('Edit plan') }} />
            <Stack.Screen name="train/[id]" options={{ title: t('Workout') }} />
          </Stack>
        </ThemeProvider>
      </UnitProvider>
    </SessionProvider>
  );
}
