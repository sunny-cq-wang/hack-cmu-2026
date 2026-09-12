// PLACEHOLDER — P4 replaces this file (delete it, do not merge into it).
//
// Exports exactly the interface `tasks/P1_MOBILE_CORE.md` §6 promises. The real
// version renders Rive and drives `happiness` from `today.avatarState`; this one
// just shows the mood so the layout is honest about its size.
import { StyleSheet, Text, View } from 'react-native';

import { Button, Skeleton, colors, radius, spacing, stateColor, typography } from '../../components/ui';
import { useToday } from '../../lib/queries';

export interface PetAvatarProps {
  size?: number;
}

export function PetAvatar({ size = 220 }: PetAvatarProps): React.JSX.Element {
  const today = useToday();

  if (today.isPending) {
    return <Skeleton height={size} borderRadius={radius.xl} />;
  }

  const mood = today.data?.mood ?? null;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={mood ? `Your pet looks ${mood}` : 'Pet avatar'}
      style={[styles.frame, { height: size, borderColor: stateColor(mood) }]}
    >
      <Text style={[typography.title, { color: stateColor(mood) }]}>{mood ?? 'no data'}</Text>
      <Text style={typography.caption}>Rive avatar arrives with P4</Text>
    </View>
  );
}

export interface AvatarGeneratorProps {
  onReady: () => void;
}

export function AvatarGenerator({ onReady }: AvatarGeneratorProps): React.JSX.Element {
  return (
    <View style={styles.generator}>
      <Text style={typography.heading}>Avatar generation lands with P4</Text>
      <Text style={typography.caption}>
        Grok Imagine will turn your pet&apos;s photo into the neutral, thriving and drooping poses here.
      </Text>
      <Button title="Continue" onPress={onReady} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.xl,
    borderWidth: 2,
    backgroundColor: colors.card,
  },
  generator: { gap: spacing.md },
});
