import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';
import { PetForm } from './PetForm';
import { PetSchema } from '@petplate/shared';
import { PortionCard } from './PortionCard';
import { FeedButton } from './FeedButton';
import { WeighInSheet } from './WeighInSheet';
import { WeightChart } from './WeightChart';
import { AdjustmentHistory } from './AdjustmentHistory';
import { useMe, usePet, useToday, useWeighIns } from './queries';

export function PetScreen() {
  const todayQ = useToday();
  const petQ = usePet();
  const meQ = useMe();
  const petWeigh = useWeighIns('pet');
  const userWeigh = useWeighIns('user');
  const [petSheet, setPetSheet] = useState(false);
  const [userSheet, setUserSheet] = useState(false);
  const [toast, setToast] = useState<{ message: string; vet: boolean } | null>(null);
  const [editing, setEditing] = useState(false);

  if (todayQ.isLoading || petQ.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (todayQ.isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>Could not load today.</Text>
        <Pressable onPress={() => todayQ.refetch()}>
          <Text style={styles.link}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const today = todayQ.data;
  const pet = petQ.data;
  if (!today?.pet || !pet) {
    return <PetForm onSaved={() => setEditing(false)} />;
  }
  if (editing) {
    return <PetForm existing={PetSchema.parse(pet)} onSaved={() => setEditing(false)} />;
  }

  const virtual = pet.species === 'virtual';
  const goalLabel = pet.goal === 'lose' ? `Losing weight → ${pet.idealWeightKg} kg` : 'Maintaining weight';
  const merNote =
    pet.goal === 'lose'
      ? `RER of ideal weight × ${pet.targets.merFactor} (weight-loss factor)`
      : `RER of current weight × ${pet.targets.merFactor}`;
  const slope = petWeigh.data?.trend.slopeKgPerWeek;
  const goalDate = petWeigh.data?.trend.projectedGoalDate;
  const caption =
    slope != null
      ? `${slope.toFixed(2)} kg/week${goalDate ? ` · goal ≈ ${goalDate}` : ''}`
      : undefined;
  const latestUser = userWeigh.data?.weighIns[0];

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.header}>
        <Text style={styles.name}>{pet.name}</Text>
        <View style={styles.chips}>
          <Text style={styles.chip}>{pet.species}</Text>
          <Text style={styles.chip}>{goalLabel}</Text>
        </View>
        <Pressable onPress={() => setEditing(true)}>
          <Text style={styles.link}>Edit</Text>
        </Pressable>
      </View>
      <PortionCard pet={today.pet} kcal={pet.targets.kcal} merNote={merNote} />
      <FeedButton pet={today.pet} />
      {!virtual ? (
        <>
          <Pressable style={styles.secondary} onPress={() => setPetSheet(true)}>
            <Text style={styles.secondaryText}>Log pet weigh-in</Text>
          </Pressable>
          <WeightChart trend={petWeigh.data?.trend} idealWeightKg={pet.idealWeightKg} caption={caption} />
        </>
      ) : (
        <Text style={styles.muted}>Virtual pets skip weigh-ins — the 10 kg profile stays fixed.</Text>
      )}
      <View style={styles.card}>
        <Text style={styles.section}>Your weight</Text>
        <Text style={styles.muted}>{latestUser ? `${latestUser.weightKg} kg` : 'No weigh-ins yet'}</Text>
        <Pressable onPress={() => setUserSheet(true)}>
          <Text style={styles.link}>Log weigh-in</Text>
        </Pressable>
      </View>
      <AdjustmentHistory items={today.adjustments} subject="pet" />
      <AdjustmentHistory items={today.adjustments} subject="user" />
      <Text style={styles.footer}>
        Portions are estimates. Not veterinary advice — confirm with your vet, especially for cats.
      </Text>
      {toast ? (
        <View style={[styles.toast, toast.vet && styles.toastVet]}>
          <Text style={styles.toastText}>
            {toast.message}
            {toast.vet ? ' Consider checking with your vet.' : ''}
          </Text>
        </View>
      ) : null}
      <WeighInSheet
        visible={petSheet}
        onClose={() => setPetSheet(false)}
        subjectType="pet"
        subjectId={pet.id}
        onMessage={(message, vetFlag) => setToast({ message, vet: vetFlag })}
      />
      {meQ.data?.id ? (
        <WeighInSheet
          visible={userSheet}
          onClose={() => setUserSheet(false)}
          subjectType="user"
          subjectId={meQ.data.id}
          onMessage={(message, vetFlag) => setToast({ message, vet: vetFlag })}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 16, backgroundColor: colors.bg, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, gap: 8 },
  header: { gap: 8 },
  name: { color: colors.text, fontSize: 32, fontWeight: '700' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { backgroundColor: colors.card, color: colors.text, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
  link: { color: colors.accent },
  secondary: { borderWidth: 1, borderColor: colors.accent, borderRadius: 12, padding: 12, alignItems: 'center' },
  secondaryText: { color: colors.accent, fontWeight: '600' },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 16, gap: 6 },
  section: { color: colors.text, fontWeight: '600' },
  muted: { color: colors.muted },
  footer: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  err: { color: colors.drooping },
  toast: { backgroundColor: colors.card, padding: 12, borderRadius: 10 },
  toastVet: { backgroundColor: colors.okay },
  toastText: { color: colors.text },
});
