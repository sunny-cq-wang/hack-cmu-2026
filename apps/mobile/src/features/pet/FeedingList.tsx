import { Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';
import { useDeleteFeeding, useFeedings } from './queries';

export function FeedingList(props: { petId: string; petName: string }) {
  const feedings = useFeedings();
  const remove = useDeleteFeeding();
  const [error, setError] = useState<string | null>(null);

  if (feedings.isLoading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (feedings.isError) {
    return (
      <View style={styles.card}>
        <Text style={styles.err}>Could not load today's meals.</Text>
        <Pressable onPress={() => void feedings.refetch()}>
          <Text style={styles.link}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const rows = feedings.data ?? [];
  if (rows.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.section}>{props.petName}'s meals today</Text>
      {error ? <Text style={styles.err}>{error}</Text> : null}
      {rows.map((feeding) => {
        const time = new Date(feeding.fedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const busy = remove.isPending && remove.variables?.feedingId === feeding.id;
        return (
          <View key={feeding.id} style={styles.row}>
            <View style={styles.body}>
              <Text style={styles.time}>{time}</Text>
              <Text style={styles.grams}>{Math.round(feeding.grams)} g</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete ${Math.round(feeding.grams)} gram feeding at ${time}`}
              disabled={remove.isPending}
              onPress={() => {
                setError(null);
                remove.mutate(
                  { petId: props.petId, feedingId: feeding.id },
                  { onError: (cause) => setError(cause instanceof Error ? cause.message : 'Could not delete that meal.') },
                );
              }}
              style={({ pressed }) => [styles.trash, pressed && { opacity: 0.7 }]}
            >
              {busy ? <ActivityIndicator color={colors.drooping} size="small" /> : <Trash2 size={18} color={colors.drooping} />}
            </Pressable>
          </View>
        );
      })}
      <Text style={styles.hint}>Tap the trash to remove a meal logged by mistake.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 16, gap: 10 },
  section: { color: colors.text, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  body: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  time: { color: colors.text },
  grams: { color: colors.muted, fontWeight: '600' },
  trash: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  hint: { color: colors.muted, fontSize: 12 },
  err: { color: colors.drooping },
  link: { color: colors.accent },
});
