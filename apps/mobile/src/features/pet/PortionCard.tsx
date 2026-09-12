import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';
import type { TodaySummary } from '@petplate/shared';
import { useState } from 'react';

export function PortionCard(props: { pet: NonNullable<TodaySummary['pet']>; kcal: number; merNote: string }) {
  const [open, setOpen] = useState(false);
  const perMeal = props.pet.mealsPerDay > 0 ? Math.round(props.pet.targetGrams / props.pet.mealsPerDay) : props.pet.targetGrams;
  return (
    <View style={styles.card}>
      <Text style={styles.big}>{perMeal} g</Text>
      <Text style={styles.sub}>
        per meal · {props.pet.targetGrams} g/day · {props.kcal} kcal
      </Text>
      <Text style={styles.progress}>
        {props.pet.feedingsToday} of {props.pet.mealsPerDay} meals today
      </Text>
      <Text style={styles.note}>{props.merNote}</Text>
      <Pressable onPress={() => setOpen((v) => !v)}>
        <Text style={styles.link}>{open ? 'Hide formula' : 'How is this calculated?'}</Text>
      </Pressable>
      {open ? (
        <Text style={styles.disclaimer}>
          Daily calories start from resting energy at the reference weight, multiplied by a species MER factor.
          Reference weight is ideal weight when losing and current weight when maintaining. Portions are estimates. Not
          veterinary advice — confirm with your vet, especially for cats.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 20, gap: 6 },
  big: { color: colors.text, fontSize: 48, fontWeight: '700' },
  sub: { color: colors.muted, fontSize: 14 },
  progress: { color: colors.text, marginTop: 8 },
  note: { color: colors.muted, fontSize: 13 },
  link: { color: colors.accent, marginTop: 8 },
  disclaimer: { color: colors.muted, fontSize: 12, marginTop: 8, lineHeight: 18 },
});
