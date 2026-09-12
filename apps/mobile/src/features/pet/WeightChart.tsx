import { StyleSheet, Text, View } from 'react-native';
import type { Trend } from '@petplate/shared';
import { colors } from './theme';

/** Lightweight chart until P1 adds victory-native to the Expo app. */
export function WeightChart(props: { trend: Trend | undefined; idealWeightKg: number; caption?: string }) {
  const points = props.trend?.points ?? [];
  if (points.length === 0) {
    return (
      <Text style={styles.empty}>Add a weigh-in weekly and PetPlate will tune the portion automatically.</Text>
    );
  }
  const kgs = points.map((p) => p.kg);
  const min = Math.min(...kgs, props.idealWeightKg);
  const max = Math.max(...kgs, props.idealWeightKg);
  const span = Math.max(0.1, max - min);
  return (
    <View style={styles.wrap}>
      <View style={styles.chart}>
        {points.map((p, i) => {
          const x = (i / Math.max(1, points.length - 1)) * 100;
          const y = ((max - p.kg) / span) * 100;
          return <View key={p.at} style={[styles.dot, { left: `${x}%`, top: `${y}%` }]} />;
        })}
        <View style={[styles.ideal, { top: `${((max - props.idealWeightKg) / span) * 100}%` }]} />
      </View>
      {props.caption ? <Text style={styles.caption}>{props.caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  chart: { height: 140, backgroundColor: colors.card, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  dot: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginLeft: -4, marginTop: -4 },
  ideal: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.thriving, opacity: 0.7 },
  caption: { color: colors.muted, fontSize: 13 },
  empty: { color: colors.muted, fontSize: 14 },
});
