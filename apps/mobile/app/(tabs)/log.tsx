// STUB — P1 hands this over; the camera → analyze → confirm flow is built here next.
import { SafeAreaView, StyleSheet, Text } from 'react-native';

import { colors, spacing, typography } from '../../src/components/ui';

export default function LogTab(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.screen}>
      <Text style={typography.heading}>Log</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.bg },
});
