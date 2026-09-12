/**
 * One meal of a generated plan (`POST /mealplans/generate`, docs/API_CONTRACTS.md §4).
 * Every number here is straight off `MealPlan` — the app does no portioning.
 */
import type { MealPlan } from '@petplate/shared';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, Chip, colors, spacing, typography } from '../../components/ui';
import { slotLabel } from '../meals';

export type PlannedMeal = MealPlan['meals'][number];

export interface PlanCardProps {
  meal: PlannedMeal;
  /** `plan.verified` — USDA totals landed inside the tolerance the server checks. */
  verified: boolean;
  logging: boolean;
  logged: boolean;
  onLog: () => void;
}

export function PlanCard({ meal, verified, logging, logged, onLog }: PlanCardProps): React.JSX.Element {
  return (
    <Card>
      <View style={styles.header}>
        <Text style={typography.label}>{slotLabel(meal.slot)}</Text>
        {verified ? <Chip label="USDA-verified" tone={colors.thriving} /> : null}
      </View>

      <Text style={typography.heading}>{meal.title}</Text>

      <View style={styles.lines}>
        {meal.ingredientLines.map((line) => (
          <Text key={`${line.name}-${line.grams}`} style={typography.body}>
            {line.name} · {Math.round(line.grams)} g
          </Text>
        ))}
      </View>

      <Text style={typography.caption}>{Math.round(meal.nutrients.kcal)} kcal</Text>

      <Button
        title={logged ? 'Logged' : 'Log this meal'}
        variant={logged ? 'secondary' : 'primary'}
        loading={logging}
        disabled={logged}
        onPress={onLog}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  lines: { gap: 2 },
});
