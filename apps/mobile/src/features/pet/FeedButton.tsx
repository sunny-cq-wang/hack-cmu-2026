import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { TodaySummary } from '@petplate/shared';
import { colors } from './theme';
import { useFeed } from './queries';

export function FeedButton(props: { pet: NonNullable<TodaySummary['pet']> }) {
  const feed = useFeed();
  const [customOpen, setCustomOpen] = useState(false);
  const [grams, setGrams] = useState(() =>
    props.pet.mealsPerDay > 0 ? Math.round(props.pet.targetGrams / props.pet.mealsPerDay) : props.pet.targetGrams,
  );
  const over = props.pet.fedGrams > props.pet.targetGrams * 1.1;
  const busy = feed.isPending;

  async function log(amount: number) {
    if (busy) return;
    await feed.mutateAsync({ petId: props.pet.petId, grams: amount });
  }

  return (
    <View style={{ gap: 8 }}>
      <Pressable
        disabled={busy}
        onPress={() => void log(grams)}
        style={[styles.btn, over && styles.over, busy && { opacity: 0.6 }]}
      >
        {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.btnText}>{over ? `Over today's portion` : `Fed ${props.pet.name} (${grams} g)`}</Text>}
      </Pressable>
      <Pressable onPress={() => setCustomOpen(true)}>
        <Text style={styles.link}>custom amount</Text>
      </Pressable>
      <Modal visible={customOpen} transparent animationType="slide" onRequestClose={() => setCustomOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setCustomOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Custom grams</Text>
            <View style={styles.stepper}>
              <Pressable onPress={() => setGrams((g) => Math.max(5, g - 5))} style={styles.step}>
                <Text style={styles.stepText}>−</Text>
              </Pressable>
              <Text style={styles.grams}>{grams} g</Text>
              <Pressable onPress={() => setGrams((g) => g + 5)} style={styles.step}>
                <Text style={styles.stepText}>+</Text>
              </Pressable>
            </View>
            <Pressable
              style={styles.btn}
              onPress={() => {
                setCustomOpen(false);
                void log(grams);
              }}
            >
              <Text style={styles.btnText}>Log {grams} g</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { backgroundColor: colors.thriving, borderRadius: 12, padding: 16, alignItems: 'center' },
  over: { backgroundColor: colors.okay },
  btnText: { color: colors.bg, fontWeight: '700', fontSize: 16 },
  link: { color: colors.accent, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, padding: 24, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 16 },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 },
  step: { backgroundColor: colors.bg, width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.text, fontSize: 24 },
  grams: { color: colors.text, fontSize: 28, fontWeight: '700', minWidth: 90, textAlign: 'center' },
});
