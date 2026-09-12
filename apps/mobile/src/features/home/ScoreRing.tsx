/**
 * The combined daily score as a 120 px arc (`tasks/P1_MOBILE_CORE.md` §4, item 2).
 *
 * The score itself is computed server-side and stored in `dailyScores`
 * (AGENTS.md §4.3); this only turns the number it is handed into an arc length.
 */
import type { AvatarState } from '@petplate/shared';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { colors, stateColor, typography } from '../../components/ui';

/** Scores are 0–100 per `docs/ALGORITHMS.md`; the ring never draws past either end. */
const MAX_SCORE = 100;
const DEFAULT_SIZE = 120;
const STROKE = 10;

export interface ScoreRingProps {
  /** `today.combined` — already computed by the server. */
  combined: number;
  /** `today.avatarState`; the only input to the ring's colour. */
  state: AvatarState;
  size?: number;
}

export function ScoreRing({ combined, state, size = DEFAULT_SIZE }: ScoreRingProps): React.JSX.Element {
  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const score = Math.max(0, Math.min(MAX_SCORE, Math.round(combined)));
  const swept = circumference * (score / MAX_SCORE);
  const color = stateColor(state);
  const center = size / 2;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`Today's combined score: ${score} out of ${MAX_SCORE}`}
      accessibilityValue={{ min: 0, max: MAX_SCORE, now: score }}
      style={[styles.wrap, { width: size, height: size }]}
    >
      <Svg width={size} height={size}>
        {/* -90° so the arc starts at 12 o'clock and fills clockwise. */}
        <G rotation={-90} origin={`${center}, ${center}`}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={colors.border}
            strokeWidth={STROKE}
            fill="none"
          />
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference - swept}
            fill="none"
          />
        </G>
      </Svg>

      <View style={styles.center} pointerEvents="none">
        <Text style={[typography.display, styles.score, { color }]}>{score}</Text>
        <Text style={typography.label}>Today</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: { lineHeight: 36 },
});
