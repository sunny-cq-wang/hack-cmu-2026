import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing, typography } from './theme';

export interface SegmentedOption<T extends string> {
  label: string;
  value: T;
  /** One-line explanation, shown only in the vertical layout (activity levels). */
  description?: string;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T | null;
  onChange: (next: T) => void;
  label?: string;
  /** 'vertical' turns the control into a radio list with descriptions. */
  orientation?: 'horizontal' | 'vertical';
  style?: StyleProp<ViewStyle>;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  orientation = 'horizontal',
  style,
}: SegmentedProps<T>): React.JSX.Element {
  const vertical = orientation === 'vertical';

  return (
    <View style={[styles.wrapper, style]}>
      {label ? <Text style={typography.label}>{label}</Text> : null}
      <View style={vertical ? styles.stack : styles.row}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={[
                vertical ? styles.stackItem : styles.rowItem,
                selected && styles.selected,
              ]}
            >
              <Text style={[typography.body, selected && styles.selectedLabel]}>{option.label}</Text>
              {vertical && option.description ? (
                <Text style={typography.caption}>{option.description}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  row: {
    flexDirection: 'row',
    backgroundColor: colors.cardRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  rowItem: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
  },
  stack: { gap: spacing.sm },
  stackItem: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardRaised,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: 2,
  },
  selected: { backgroundColor: colors.thriving, borderColor: colors.thriving },
  selectedLabel: { color: colors.bg, fontWeight: '600' },
});
