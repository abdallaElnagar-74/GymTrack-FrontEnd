import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { migrateDb } from '@/src/db/schema';
import { theme } from '@/src/theme';
import { SyncProvider } from '@/src/sync/SyncContext';
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
    <SQLiteProvider databaseName="gymapp.db" onInit={migrateDb}>
      <SyncProvider>
      <UnitProvider>
        <ThemeProvider value={navTheme}>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text, headerShadowVisible: false, headerBackButtonDisplayMode: 'minimal' }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="exercise/[id]" options={{ title: 'Exercise' }} />
            <Stack.Screen name="workout/[id]" options={{ title: 'Workout' }} />
            <Stack.Screen name="routine/[id]" options={{ title: 'Edit plan' }} />
            <Stack.Screen name="account" options={{ title: 'Cloud sync', presentation: 'modal' }} />
          </Stack>
        </ThemeProvider>
      </UnitProvider>
      </SyncProvider>
    </SQLiteProvider>
  );
}
