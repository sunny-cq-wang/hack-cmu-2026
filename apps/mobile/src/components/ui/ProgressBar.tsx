import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from './theme';

export interface ProgressBarProps {
  value: number;
  max: number;
  /** Defaults to the app accent; pass `stateColor(today.avatarState)` for mood bars. */
  color?: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function ProgressBar({
  value,
  max,
  color = colors.thriving,
  height = 8,
  style,
  accessibilityLabel,
}: ProgressBarProps): React.JSX.Element {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max, now: value }}
      style={[styles.track, { height, borderRadius: height / 2 }, style]}
    >
      <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: color, borderRadius: height / 2 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { alignSelf: 'stretch', backgroundColor: colors.border, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%' },
});
