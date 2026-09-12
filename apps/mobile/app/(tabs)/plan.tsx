// STUB — P1 hands this over; the gaps list and tomorrow's plan are built here next.
import { SafeAreaView, StyleSheet, Text } from 'react-native';

import { colors, spacing, typography } from '../../src/components/ui';

export default function PlanTab(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.screen}>
      <Text style={typography.heading}>Plan</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.bg },
});
