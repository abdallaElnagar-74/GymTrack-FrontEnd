import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import { View } from 'react-native';

import { theme } from '@/src/theme';

type IconSpec = { ios: any; android: any; web: any };

function TabIcon({ spec, color, focused }: { spec: IconSpec; color: any; focused: boolean }) {
  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: focused ? 'rgba(198,255,61,0.14)' : 'transparent',
      }}>
      <SymbolView name={spec} tintColor={color} size={24} />
    </View>
  );
}

function icon(spec: IconSpec) {
  const render = ({ color, focused }: { color: any; focused: boolean }) => (
    <TabIcon spec={spec} color={color} focused={focused} />
  );
  return render;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.faint,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarStyle: {
          backgroundColor: theme.card,
          borderTopColor: theme.border,
          height: 68,
          paddingTop: 8,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Workout',
          tabBarIcon: icon({ ios: 'dumbbell.fill', android: 'fitness_center', web: 'fitness_center' }),
        }}
      />
      <Tabs.Screen
        name="plans"
        options={{
          title: 'Plans',
          tabBarIcon: icon({ ios: 'square.stack.3d.up.fill', android: 'view_agenda', web: 'view_agenda' }),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: icon({ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }),
        }}
      />
      <Tabs.Screen
        name="exercises"
        options={{
          title: 'Exercises',
          tabBarIcon: icon({ ios: 'list.bullet', android: 'list', web: 'list' }),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: icon({ ios: 'gearshape.fill', android: 'settings', web: 'settings' }),
        }}
      />
    </Tabs>
  );
}
