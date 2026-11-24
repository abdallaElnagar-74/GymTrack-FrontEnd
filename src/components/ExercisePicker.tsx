import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApi } from '@/src/api/SessionContext';
import { getExercises, type Exercise } from '../db/queries';
import { MUSCLE_GROUPS } from '../db/seed';
import { groupColor, theme } from '../theme';
import { GroupDot } from './ui';

export function ExercisePicker({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (e: Exercise) => void;
}) {
  const api = useApi();
  const insets = useSafeAreaInsets();
  const [all, setAll] = useState<Exercise[]>([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      getExercises(api).then(setAll);
    }
  }, [visible, api]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter(
      (e) => (!s || e.name.toLowerCase().includes(s)) && (!filter || e.muscle_group === filter)
    );
  }, [all, q, filter]);

  const reset = () => {
    setQ('');
    setFilter(null);
  };
  const close = () => {
    reset();
    onClose();
  };
  const pick = (e: Exercise) => {
    reset();
    onPick(e);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <View style={styles.top}>
          <Text style={styles.title}>Add exercise</Text>
          <Pressable onPress={close} hitSlop={10} style={styles.closeBtn}>
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>
        <TextInput
          style={styles.search}
          value={q}
          onChangeText={setQ}
          placeholder="Search exercises…"
          placeholderTextColor={theme.faint}
        />
        <View style={styles.filters}>
          {[null, ...MUSCLE_GROUPS].map((g) => {
            const active = filter === g;
            const c = g ? groupColor(g) : theme.accent;
            return (
              <Pressable
                key={g ?? 'all'}
                onPress={() => setFilter(g)}
                style={[styles.filter, active && { backgroundColor: c + '26', borderColor: c }]}>
                <Text style={[styles.filterText, active && { color: c }]}>{g ?? 'All'}</Text>
              </Pressable>
            );
          })}
        </View>
        <FlatList
          data={list}
          keyExtractor={(e) => String(e.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          ListEmptyComponent={<Text style={styles.empty}>No exercises found. Add one in the Exercises tab.</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.item, pressed && { backgroundColor: theme.cardAlt }]}
              onPress={() => pick(item)}>
              <GroupDot group={item.muscle_group} />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={[styles.itemGroup, { color: groupColor(item.muscle_group) }]}>{item.muscle_group}</Text>
              </View>
              <Text style={styles.plus}>+</Text>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg, paddingHorizontal: 16 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { color: theme.text, fontSize: 28, fontWeight: '800' },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: theme.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  close: { color: theme.muted, fontSize: 16, fontWeight: '700' },
  search: {
    backgroundColor: theme.card,
    color: theme.text,
    borderRadius: 14,
    minHeight: 50,
    paddingHorizontal: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 12 },
  filter: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterText: { color: theme.muted, fontSize: 13, fontWeight: '700' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 14,
  },
  itemName: { color: theme.text, fontSize: 16, fontWeight: '600' },
  itemGroup: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  plus: { color: theme.accent, fontSize: 26, fontWeight: '700', paddingHorizontal: 6 },
  empty: { color: theme.muted, textAlign: 'center', marginTop: 30 },
});
