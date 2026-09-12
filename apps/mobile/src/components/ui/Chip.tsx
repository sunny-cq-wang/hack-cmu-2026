import { X } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from './theme';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Shows a small ✕ that removes the chip (allergy chips, draft items). */
  onRemove?: () => void;
  /** Overrides the selected background — pass `stateColor(state)` for mood tints. */
  tone?: string;
  testID?: string;
}

export function Chip({ label, selected = false, onPress, onRemove, tone, testID }: ChipProps): React.JSX.Element {
  const activeColor = tone ?? colors.thriving;
  const body = (
    <View style={styles.inner}>
      <Text
        style={[
          typography.body,
          styles.label,
          selected && { color: colors.bg, fontWeight: '600' },
          !selected && tone ? { color: activeColor } : null,
        ]}
      >
        {label}
      </Text>
      {onRemove ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${label}`} onPress={onRemove} hitSlop={10}>
          <X size={14} color={selected ? colors.bg : colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );

  const chipStyle = [
    styles.chip,
    selected && { backgroundColor: activeColor, borderColor: activeColor },
    !selected && tone ? { borderColor: activeColor } : null,
  ];

  if (!onPress) {
    return (
      <View testID={testID} style={chipStyle}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [chipStyle, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardRaised,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
  },
  inner: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  label: { fontSize: 14 },
  pressed: { opacity: 0.75 },
});
