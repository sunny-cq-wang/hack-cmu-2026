/**
 * Plan tab — this week's nutrition gaps plus a Grok-generated plan for tomorrow
 * (plan §9 / tasks/P1_MOBILE_CORE.md §4).
 */
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Skeleton, colors, radius, spacing, typography } from '../../src/components/ui';
import type { MealSlot } from '../../src/features/meals';
import {
  GapList,
  PlanCard,
  PlanInstructions,
  useInstructionsDraft,
  type PlannedMeal,
} from '../../src/features/plan';
import { isApiError } from '../../src/lib/api';
import { useCreateMeal, useGaps, useGeneratePlan } from '../../src/lib/queries';

const GAP_WINDOW_DAYS = 7;

export default function PlanTab(): React.JSX.Element {
  const gaps = useGaps(GAP_WINDOW_DAYS);
  // The 40 s budget this call needs lives inside the hook.
  const generatePlan = useGeneratePlan();
  const createMeal = useCreateMeal();

  const [generateError, setGenerateError] = useState<string | null>(null);
  const [logError, setLogError] = useState<string | null>(null);
  const [loggingSlot, setLoggingSlot] = useState<MealSlot | null>(null);
  const [loggedSlots, setLoggedSlots] = useState<MealSlot[]>([]);
  // Survives tab switches: the draft lives outside this component (features/plan).
  const [instructions, setInstructions] = useInstructionsDraft();

  const plan = generatePlan.data ?? null;

  const generate = (): void => {
    setGenerateError(null);
    setLogError(null);
    setLoggedSlots([]);
    generatePlan.mutate(
      { customInstructions: instructions },
      {
        onError: (cause) =>
          setGenerateError(
            isApiError(cause) ? cause.message : "Could not build tomorrow's plan. Try again.",
          ),
      },
    );
  };

  const logMeal = (meal: PlannedMeal): void => {
    setLogError(null);
    setLoggingSlot(meal.slot);
    createMeal.mutate(
      {
        photoId: null,
        slot: meal.slot,
        source: 'plan',
        items: meal.ingredientLines.map((line) => ({ name: line.name, grams: line.grams, fdcId: null })),
      },
      {
        onSuccess: () => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setLoggedSlots((current) => [...current, meal.slot]);
        },
        onError: (cause) =>
          setLogError(isApiError(cause) ? cause.message : 'Could not log that meal. Try again.'),
        onSettled: () => setLoggingSlot(null),
      },
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={typography.title}>Plan</Text>
          <Text style={typography.caption}>Where you have been short, and what to eat about it.</Text>
        </View>

        <View style={styles.section}>
          <Text style={typography.label}>Gaps · last {GAP_WINDOW_DAYS} days</Text>
          {gaps.isPending ? (
            <View style={styles.section}>
              <Skeleton height={104} borderRadius={radius.lg} />
              <Skeleton height={104} borderRadius={radius.lg} />
            </View>
          ) : gaps.isError ? (
            <Card>
              <Text style={typography.body}>Could not load your nutrition gaps.</Text>
              <Text style={typography.caption}>{gaps.error.message}</Text>
              <Button title="Try again" variant="secondary" onPress={() => void gaps.refetch()} />
            </Card>
          ) : (
            <GapList gaps={gaps.data.gaps} />
          )}
        </View>

        <View style={styles.section}>
          <Text style={typography.label}>Tomorrow</Text>

          <PlanInstructions
            value={instructions}
            onChange={setInstructions}
            disabled={generatePlan.isPending}
          />

          <Button
            title={plan ? 'Plan tomorrow again' : 'Plan tomorrow'}
            onPress={generate}
            loading={generatePlan.isPending}
          />

          {generatePlan.isPending ? (
            <View style={styles.spinnerRow}>
              <ActivityIndicator color={colors.thriving} />
              <Text style={typography.caption}>Asking Grok, verifying with USDA…</Text>
            </View>
          ) : null}

          {generateError ? (
            <Card>
              <Text style={styles.error}>{generateError}</Text>
              <Button title="Try again" variant="secondary" onPress={generate} />
            </Card>
          ) : null}

          {!plan && !generatePlan.isPending && !generateError ? (
            <Card>
              <Text style={typography.body}>No plan yet.</Text>
              <Text style={typography.caption}>
                Generate one and PetPlate will aim tomorrow's meals at the gaps above.
              </Text>
            </Card>
          ) : null}

          {plan ? (
            <View style={styles.section}>
              <Text style={typography.caption}>
                For {plan.forDayKey} · {Math.round(plan.dayTotals.kcal)} kcal across {plan.meals.length} meals
              </Text>
              {plan.customInstructions ? (
                <Text style={typography.caption}>Built with: {plan.customInstructions}</Text>
              ) : null}
              {logError ? <Text style={styles.error}>{logError}</Text> : null}
              {plan.meals.map((meal) => (
                <PlanCard
                  key={meal.slot}
                  meal={meal}
                  verified={plan.verified}
                  logging={loggingSlot === meal.slot}
                  logged={loggedSlots.includes(meal.slot)}
                  onLog={() => logMeal(meal)}
                />
              ))}
            </View>
          ) : null}
        </View>

        <Text style={[typography.caption, styles.disclaimer]}>Not medical or veterinary advice.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl },
  header: { gap: spacing.xs },
  section: { gap: spacing.md },
  spinnerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  error: { ...typography.body, color: colors.drooping },
  disclaimer: { textAlign: 'center' },
});
