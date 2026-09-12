/** One line of the meal draft: name, grams stepper, display-only kcal, confidence. */
import { Minus, Plus } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Chip, TextField, colors, radius, spacing, typography } from '../../components/ui';
import { estimatedKcal, type DraftItem } from './draft';

export interface ItemRowProps {
  item: DraftItem;
  onChange: (next: DraftItem) => void;
}

/** Below this the vision model is guessing, so we say so (tasks/P1_MOBILE_CORE.md §4). */
const LOW_CONFIDENCE = 0.6;
const STEP_G = 10;

export function ItemRow({ item, onChange }: ItemRowProps): React.JSX.Element {
  const [gramsText, setGramsText] = useState(String(item.grams));

  // Keep the field in sync when the ± buttons move grams behind its back.
  useEffect(() => {
    setGramsText((current) => (Number(current) === item.grams ? current : String(item.grams)));
  }, [item.grams]);

  const setGrams = (grams: number): void => onChange({ ...item, grams: Math.max(0, Math.round(grams)) });

  const onGramsText = (raw: string): void => {
    const digits = raw.replace(/[^0-9]/g, '');
    setGramsText(digits);
    const parsed = Number(digits);
    if (digits.length > 0 && Number.isFinite(parsed)) {
      onChange({ ...item, grams: parsed });
    }
  };

  const kcal = estimatedKcal(item);

  return (
    <View style={styles.row}>
      <View style={styles.headline}>
        <Text style={[typography.body, styles.name]} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={typography.caption}>
          {/* Display-only estimate; the server recomputes from USDA on save. */}
          {kcal === null ? 'kcal on save' : `≈ ${kcal} kcal`}
        </Text>
      </View>

      <View style={styles.stepper}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${STEP_G} grams of ${item.name}`}
          onPress={() => setGrams(item.grams - STEP_G)}
          disabled={item.grams <= 0}
          style={({ pressed }) => [styles.step, pressed && styles.pressed, item.grams <= 0 && styles.stepOff]}
        >
          <Minus size={16} color={colors.text} />
        </Pressable>

        <TextField
          style={styles.gramsField}
          value={gramsText}
          onChangeText={onGramsText}
          keyboardType="number-pad"
          suffix="g"
          testID={`grams-${item.key}`}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add ${STEP_G} grams of ${item.name}`}
          onPress={() => setGrams(item.grams + STEP_G)}
          style={({ pressed }) => [styles.step, pressed && styles.pressed]}
        >
          <Plus size={16} color={colors.text} />
        </Pressable>
      </View>

      {item.confidence < LOW_CONFIDENCE ? (
        <Chip label={`${Math.round(item.confidence * 100)}% sure — check this one`} tone={colors.okay} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.cardRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  headline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  name: { flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  step: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepOff: { opacity: 0.4 },
  gramsField: { flex: 1 },
  pressed: { opacity: 0.7 },
});
