import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { SessionProvider } from '@/src/api/SessionContext';
import { theme } from '@/src/theme';
import { UnitProvider } from '@/src/UnitContext';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  anchor: '(tabs)',
};

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
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
          <StatusBar style="light" />
          <Stack screenOptions={{ headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text, headerShadowVisible: false, headerBackButtonDisplayMode: 'minimal' }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="exercise/[id]" options={{ title: 'Exercise' }} />
            <Stack.Screen name="workout/[id]" options={{ title: 'Workout' }} />
            <Stack.Screen name="routine/[id]" options={{ title: 'Edit plan' }} />
          </Stack>
        </ThemeProvider>
      </UnitProvider>
    </SessionProvider>
  );
}
