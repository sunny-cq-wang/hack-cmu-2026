/**
 * The little dark bubble the pet speaks in when you tap it.
 *
 * Purely presentational — `PetAvatar` picks the line (`petPersonality.ts`) and owns
 * the dismiss timer. Remount it with a changing `key` to replay the entrance.
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius, spacing } from '../../components/ui';

const IN_MS = 200;
const OUT_MS = 260;

interface PetSpeechBubbleProps {
  text: string;
  /** Width of the avatar box; the bubble stays inside it so Android can't clip it. */
  size: number;
  /** False under reduce-motion — the bubble then fades without the springy scale. */
  animate: boolean;
  /** Flipped to false by the parent's dismiss timer to play the bubble out. */
  visible: boolean;
}

export function PetSpeechBubble({
  text,
  size,
  animate,
  visible,
}: PetSpeechBubbleProps): React.JSX.Element {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, {
      duration: visible ? IN_MS : OUT_MS,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
    });
  }, [visible, progress]);

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: p,
      transform: animate
        ? [{ translateY: (1 - p) * 6 }, { scale: 0.9 + 0.1 * p }]
        : [{ translateY: 0 }, { scale: 1 }],
    };
  }, [animate]);

  return (
    <Animated.View
      style={[styles.wrap, { maxWidth: size * 0.92, top: spacing.xs }, style]}
      pointerEvents="none"
      accessibilityRole="text"
      accessibilityLabel={text}
    >
      <View style={styles.bubble}>
        <Text style={styles.text} numberOfLines={2}>
          {text}
        </Text>
      </View>
      <View style={styles.tail} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
  },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'rgba(26, 29, 36, 0.94)',
  },
  /** A downward nub, so the bubble reads as coming from the pet below it. */
  tail: {
    width: 12,
    height: 12,
    marginTop: -6,
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'rgba(26, 29, 36, 0.94)',
    transform: [{ rotate: '45deg' }],
  },
  text: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
