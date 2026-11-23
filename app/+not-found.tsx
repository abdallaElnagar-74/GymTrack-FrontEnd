import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/src/theme';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen doesn&apos;t exist.</Text>
        <Link href="/" style={styles.link}>
          <Text style={{ color: theme.accent }}>Go to home screen</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: theme.bg },
  title: { fontSize: 20, fontWeight: 'bold', color: theme.text },
  link: { marginTop: 15, paddingVertical: 15 },
});
