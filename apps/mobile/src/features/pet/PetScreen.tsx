import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, usePetPagePad } from './theme';
import { PetForm } from './PetForm';
import { PetSchema } from '@petplate/shared';
import { PortionCard } from './PortionCard';
import { FeedButton } from './FeedButton';
import { WeighInSheet } from './WeighInSheet';
import { WeightChart } from './WeightChart';
import { AdjustmentHistory } from './AdjustmentHistory';
import { FeedingList } from './FeedingList';
import { usePet, useToday, useWeighIns } from './queries';

export function PetScreen(props: { onNewPhoto?: () => void } = {}) {
  const pagePad = usePetPagePad();
  const todayQ = useToday();
  const petQ = usePet();
  const petWeigh = useWeighIns('pet');
  const [petSheet, setPetSheet] = useState(false);
  const [toast, setToast] = useState<{ message: string; vet: boolean } | null>(null);
  const [editing, setEditing] = useState(false);

  if (todayQ.isLoading || petQ.isLoading) {
    return (
      <View style={[styles.center, pagePad]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (todayQ.isError) {
    return (
      <View style={[styles.center, pagePad]}>
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
    return (
      <PetForm
        existing={PetSchema.parse(pet)}
        onSaved={() => setEditing(false)}
        onCancel={() => setEditing(false)}
        onNewPhoto={props.onNewPhoto}
      />
    );
  }

  // `/me/today` is refetched on tab focus; `usePet` can lag one render behind a
  // species change, which left the header chip saying "dog" after a save.
  const species = today.pet.species ?? pet.species;
  const virtual = species === 'virtual';
  const speciesLabel = species === 'virtual' ? 'Virtual' : species.charAt(0).toUpperCase() + species.slice(1);
  const goalLabel = pet.goal === 'lose' ? `Losing weight → ${pet.idealWeightKg} kg` : 'Maintaining weight';
  const merNote =
    pet.goal === 'lose'
      ? `RER of ideal weight × ${pet.targets.merFactor} (weight-loss factor)`
      : `RER of current weight × ${pet.targets.merFactor}`;
  const trend = petWeigh.data?.trend;
  const caption =
    trend?.slopeKgPerWeek == null
      ? undefined
      : `${trend.slopeKgPerWeek.toFixed(2)} kg/week${trend.projectedGoalDate ? ` · goal ≈ ${trend.projectedGoalDate}` : ''}`;

  return (
    <ScrollView contentContainerStyle={[styles.page, pagePad]}>
      <View style={styles.header}>
        <Text style={styles.name}>{pet.name}</Text>
        <View style={styles.chips}>
          <Text style={styles.chip}>{speciesLabel}</Text>
          <Text style={styles.chip}>{goalLabel}</Text>
        </View>
        <Pressable onPress={() => setEditing(true)}>
          <Text style={styles.link}>Edit</Text>
        </Pressable>
      </View>
      <PortionCard pet={today.pet} kcal={pet.targets.kcal} merNote={merNote} />
      <FeedButton pet={today.pet} />
      <FeedingList petId={pet.id} petName={pet.name} />
      {!virtual ? (
        <>
          <WeightChart
            trend={petWeigh.data?.trend}
            weighIns={petWeigh.data?.weighIns}
            idealWeightKg={pet.idealWeightKg}
            caption={caption}
            accessibilityLabel={`${pet.name}'s weight trend toward ${pet.idealWeightKg} kg.`}
          />
          <Pressable style={styles.secondary} onPress={() => setPetSheet(true)}>
            <Text style={styles.secondaryText}>Log pet weigh-in</Text>
          </Pressable>
        </>
      ) : (
        <Text style={styles.muted}>Virtual pets skip weigh-ins — the 10 kg profile stays fixed.</Text>
      )}
      <AdjustmentHistory items={today.adjustments} subject="pet" />
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 16, backgroundColor: colors.bg, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, gap: 8 },
  header: { gap: 8 },
  name: { color: colors.text, fontSize: 32, fontWeight: '700' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { backgroundColor: colors.card, color: colors.text, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
  link: { color: colors.accent },
  secondary: { borderWidth: 1, borderColor: colors.accent, borderRadius: 12, padding: 12, alignItems: 'center' },
  secondaryText: { color: colors.accent, fontWeight: '600' },
  muted: { color: colors.muted },
  footer: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  err: { color: colors.drooping },
  toast: { backgroundColor: colors.card, padding: 12, borderRadius: 10 },
  toastVet: { backgroundColor: colors.okay },
  toastText: { color: colors.text },
});
