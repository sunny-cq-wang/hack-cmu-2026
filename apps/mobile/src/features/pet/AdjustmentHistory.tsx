import { StyleSheet, Text, View } from 'react-native';
import type { TodaySummary } from '@petplate/shared';
import { colors } from './theme';

export function AdjustmentHistory(props: { items: TodaySummary['adjustments']; subject: 'user' | 'pet' }) {
  const rows = props.items.filter((a) => a.subject === props.subject).slice(0, 5);
  if (rows.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Adjustments</Text>
      {rows.map((r) => (
        <Text key={r.at} style={styles.row}>
          {r.message}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  title: { color: colors.text, fontWeight: '600' },
  row: { color: colors.muted, fontSize: 13 },
});
