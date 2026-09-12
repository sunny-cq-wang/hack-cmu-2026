/**
 * The nutrients the server says you have been short on this week
 * (`GET /nutrition/gaps`, docs/API_CONTRACTS.md §4).
 *
 * Presentational on purpose: the route owns the query and its loading / error
 * states, this owns the cards and the empty state.
 */
import type { GapsResponse } from '@petplate/shared';
import { StyleSheet, Text, View } from 'react-native';

import { Card, Chip, ProgressBar, colors, spacing, typography } from '../../components/ui';

/** `@petplate/shared` exports the response, not the row, so derive it. */
export type Gap = GapsResponse['gaps'][number];

export interface GapListProps {
  gaps: Gap[];
}

/** How many suggestions fit on a card (tasks/P1_MOBILE_CORE.md §4). */
const MAX_SUGGESTIONS = 3;

export function GapList({ gaps }: GapListProps): React.JSX.Element {
  if (gaps.length === 0) {
    return (
      <Card>
        <Text style={typography.body}>No gaps this week. Nice.</Text>
        <Text style={typography.caption}>Every tracked micronutrient is at or above 70% of target.</Text>
      </Card>
    );
  }

  return (
    <View style={styles.list}>
      {gaps.map((gap) => {
        const pct = Math.round(gap.pctOfTarget);
        // Cosmetic only — the server already decided this counts as a gap.
        const barColor = pct < 50 ? colors.drooping : colors.okay;

        return (
          <Card key={gap.nutrient}>
            <Text style={typography.heading}>
              {gap.label} — {pct}% of target
            </Text>
            <ProgressBar
              value={pct}
              max={100}
              color={barColor}
              accessibilityLabel={`${gap.label} at ${pct} percent of target`}
            />
            {gap.suggestFoods.length > 0 ? (
              <View style={styles.chips}>
                {gap.suggestFoods.slice(0, MAX_SUGGESTIONS).map((food) => (
                  <Chip key={food} label={food} tone={barColor} />
                ))}
              </View>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
});
