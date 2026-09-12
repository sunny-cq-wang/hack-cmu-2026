/**
 * Flame + streak length, with a "✓ today" marker once the day counts
 * (`tasks/P1_MOBILE_CORE.md` §4, item 3). Both values come from
 * `today.streak`; nothing is derived here.
 */
import { Flame } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../../components/ui';

export interface StreakBadgeProps {
  /** `today.streak.length` */
  length: number;
  /** `today.streak.todayCounted` */
  todayCounted: boolean;
}

export function StreakBadge({ length, todayCounted }: StreakBadgeProps): React.JSX.Element {
  const hasStreak = length > 0;
  const flameColor = hasStreak ? colors.okay : colors.textFaint;
  const label = hasStreak ? `${length} day${length === 1 ? '' : 's'}` : 'No streak yet';

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={
        hasStreak
          ? `${length} day streak. ${todayCounted ? 'Today counts.' : 'Today does not count yet.'}`
          : 'No streak yet. Hit both targets today to start one.'
      }
      style={styles.badge}
      testID="streak-badge"
    >
      <Flame size={18} color={flameColor} />
      <Text style={[typography.body, styles.length, { color: flameColor }]}>{label}</Text>
      {todayCounted ? (
        <Text style={[typography.label, styles.counted]}>✓ today</Text>
      ) : (
        <Text style={typography.caption}>{hasStreak ? 'keep it going' : 'hit both targets to start'}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  length: { fontWeight: '600' },
  counted: { color: colors.thriving },
});
