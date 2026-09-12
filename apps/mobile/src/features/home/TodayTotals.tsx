/**
 * The two progress rows from `tasks/P1_MOBILE_CORE.md` §4, item 4:
 *
 *   You — 1,420 / 2,100 kcal · 88 g protein
 *   Biscuit — 92 / 184 g · 1 of 2 meals   (taps through to the Pet tab)
 *
 * Every number is read straight off `/me/today`. Rounding and thousands
 * separators are display formatting; no target, portion or score is derived here
 * (AGENTS.md §4.3).
 */
import type { TodaySummary } from '@petplate/shared';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Card, ProgressBar, colors, spacing, typography } from '../../components/ui';

export interface TodayTotalsProps {
  human: TodaySummary['human'];
  /** Null until the user has a pet — the row becomes a prompt to add one. */
  pet: TodaySummary['pet'];
}

/** `1420` → `"1,420"`. Hand-rolled so the row never depends on Intl being present. */
function formatNumber(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  return sign + Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function TodayTotals({ human, pet }: TodayTotalsProps): React.JSX.Element {
  const router = useRouter();
  const goToPet = (): void => router.push('/(tabs)/pet');
  const goToYou = (): void => router.push('/(tabs)/you');

  const humanLine = `${formatNumber(human.consumed.kcal)} / ${formatNumber(human.targets.kcal)} kcal · ${formatNumber(
    human.consumed.proteinG,
  )} g protein`;

  return (
    <View style={styles.stack}>
      <Card
        onPress={goToYou}
        accessibilityLabel={`You: ${humanLine}. Opens your goals tab.`}
        testID="today-totals-human"
      >
        <View style={styles.headerRow}>
          <Text style={typography.heading}>You</Text>
          <ChevronRight size={18} color={colors.textMuted} />
        </View>
        <Text style={typography.body}>{humanLine}</Text>
        <ProgressBar
          value={human.consumed.kcal}
          max={human.targets.kcal}
          accessibilityLabel={`You: ${humanLine}`}
        />
      </Card>

      {pet ? (
        <Card
          onPress={goToPet}
          accessibilityLabel={`${pet.name}: ${formatNumber(pet.fedGrams)} of ${formatNumber(
            pet.targetGrams,
          )} grams, ${pet.feedingsToday} of ${pet.mealsPerDay} meals. Opens the pet tab.`}
          testID="today-totals-pet"
        >
          <View style={styles.headerRow}>
            <Text style={typography.heading}>{pet.name}</Text>
            <ChevronRight size={18} color={colors.textMuted} />
          </View>
          <Text style={typography.body}>
            {`${formatNumber(pet.fedGrams)} / ${formatNumber(pet.targetGrams)} g · ${pet.feedingsToday} of ${
              pet.mealsPerDay
            } meals`}
          </Text>
          <ProgressBar value={pet.fedGrams} max={pet.targetGrams} />
          <Text style={typography.caption}>
            {`${formatNumber(pet.fedKcal)} / ${formatNumber(pet.targetKcal)} kcal`}
          </Text>
        </Card>
      ) : (
        <Card onPress={goToPet} accessibilityLabel="No pet yet. Opens the pet tab." testID="today-totals-no-pet">
          <View style={styles.headerRow}>
            <Text style={typography.heading}>No pet yet</Text>
            <ChevronRight size={18} color={colors.textMuted} />
          </View>
          <Text style={typography.caption}>Add your pet to unlock the shared score.</Text>
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { alignSelf: 'stretch', gap: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
