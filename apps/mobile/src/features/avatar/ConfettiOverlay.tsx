/**
 * Confetti for the layered fallback, so a streak flip still celebrates without
 * `pet.riv`. When Rive is enabled its own `Confetti` layer takes over.
 */
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

const COLORS = ['#F7C948', '#EF7B45', '#5AA9E6', '#7FD1AE', '#D264B6'];
const PIECES = 14;
const DURATION_MS = 1500;

interface PieceProps {
  size: number;
  index: number;
  progress: SharedValue<number>;
}

function Piece({ size, index, progress }: PieceProps): React.JSX.Element {
  const startX = useMemo(() => (index / PIECES) * size + (index % 3) * 6 - 12, [index, size]);
  const drift = useMemo(() => (index % 2 === 0 ? 18 : -18), [index]);
  const color = COLORS[index % COLORS.length] ?? COLORS[0];

  const style = useAnimatedStyle(() => ({
    opacity: progress.value < 0.85 ? 1 : (1 - progress.value) / 0.15,
    transform: [
      { translateX: startX + drift * progress.value },
      { translateY: -12 + progress.value * (size * 0.95) },
      { rotate: `${progress.value * 540 * (index % 2 === 0 ? 1 : -1)}deg` },
    ],
  }));

  return <Animated.View style={[styles.piece, { backgroundColor: color }, style]} />;
}

export function ConfettiOverlay({ size, runId }: { size: number; runId: number }): React.JSX.Element | null {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (runId === 0) return;
    progress.value = 0;
    progress.value = withTiming(1, { duration: DURATION_MS, easing: Easing.out(Easing.quad) });
  }, [runId, progress]);

  if (runId === 0) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { width: size, height: size }]} pointerEvents="none">
      {Array.from({ length: PIECES }, (_, index) => (
        <Piece key={`${runId}-${index}`} size={size} index={index} progress={progress} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  piece: {
    position: 'absolute',
    width: 9,
    height: 14,
    borderRadius: 2,
  },
});
