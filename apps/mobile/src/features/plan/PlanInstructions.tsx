/**
 * Free-text steering for the meal planner ("include salmon twice", "nothing over 20 minutes").
 * The text is sent as `customInstructions` on `POST /mealplans/generate`; the server decides
 * what to do with it — this component only collects it.
 */
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Chip, colors, radius, spacing, typography } from '../../components/ui';

/** Mirrors `MealPlanInstructions` in @petplate/shared, so the server never has to reject us. */
export const MAX_INSTRUCTIONS_LENGTH = 500;

/** One tap each; tapping a selected chip takes it back out. */
export const QUICK_INSTRUCTIONS = [
  'high protein',
  'quick to cook',
  'budget friendly',
  'more veggies',
  'no red meat',
] as const;

export type QuickInstruction = (typeof QUICK_INSTRUCTIONS)[number];

/** Case-insensitive substring match — good enough to keep a chip from being added twice. */
export function hasInstruction(current: string, phrase: string): boolean {
  return current.toLowerCase().includes(phrase.toLowerCase());
}

/** Appends `phrase` as a comma-separated clause, staying inside the shared length cap. */
export function appendInstruction(current: string, phrase: string): string {
  const base = current.trim().replace(/[,\s]+$/, '');
  const next = base.length ? `${base}, ${phrase}` : phrase;
  return next.slice(0, MAX_INSTRUCTIONS_LENGTH);
}

/** Removes a clause a chip added, leaving hand-typed text either side of it intact. */
export function removeInstruction(current: string, phrase: string): string {
  const clauses = current
    .split(',')
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
  const kept = clauses.filter((clause) => clause.toLowerCase() !== phrase.toLowerCase());
  if (kept.length !== clauses.length) return kept.join(', ');

  // The phrase was typed inside a longer sentence: cut it out and tidy the separators.
  const at = current.toLowerCase().indexOf(phrase.toLowerCase());
  if (at < 0) return current;
  return `${current.slice(0, at)}${current.slice(at + phrase.length)}`
    .replace(/\s{2,}/g, ' ')
    .replace(/,\s*,/g, ',')
    .replace(/^[,\s]+|[,\s]+$/g, '');
}

export interface PlanInstructionsProps {
  value: string;
  onChange: (next: string) => void;
  /** True while a plan is generating — the field stays readable but stops accepting edits. */
  disabled?: boolean;
}

export function PlanInstructions({
  value,
  onChange,
  disabled = false,
}: PlanInstructionsProps): React.JSX.Element {
  const [focused, setFocused] = useState(false);

  const toggle = (phrase: QuickInstruction): void => {
    onChange(hasInstruction(value, phrase) ? removeInstruction(value, phrase) : appendInstruction(value, phrase));
  };

  return (
    <View style={styles.wrapper}>
      <Text style={typography.label}>Anything specific?</Text>

      <View style={[styles.field, focused && styles.fieldFocused, disabled && styles.fieldDisabled]}>
        <TextInput
          testID="plan-instructions"
          value={value}
          onChangeText={(next) => onChange(next.slice(0, MAX_INSTRUCTIONS_LENGTH))}
          placeholder="e.g. use up the chickpeas in my pantry, keep lunch vegetarian"
          placeholderTextColor={colors.textFaint}
          multiline
          numberOfLines={3}
          editable={!disabled}
          maxLength={MAX_INSTRUCTIONS_LENGTH}
          autoCapitalize="sentences"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[typography.body, styles.input]}
        />
      </View>

      <View style={styles.chips}>
        {QUICK_INSTRUCTIONS.map((phrase) => (
          <Chip
            key={phrase}
            label={phrase}
            selected={hasInstruction(value, phrase)}
            onPress={disabled ? undefined : () => toggle(phrase)}
          />
        ))}
      </View>

      <Text style={typography.caption}>
        Calorie target and your allergies always win over these.
        {value.length ? ` ${value.length}/${MAX_INSTRUCTIONS_LENGTH}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  field: {
    minHeight: 88,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardRaised,
  },
  fieldFocused: { borderColor: colors.thriving },
  fieldDisabled: { opacity: 0.5 },
  input: {
    paddingVertical: spacing.sm,
    minHeight: 88,
    textAlignVertical: 'top',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
});
