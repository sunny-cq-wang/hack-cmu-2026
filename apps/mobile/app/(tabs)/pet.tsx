// STUB — P1 hands this over; it becomes a re-export of `PetScreen` from features/pet (P3).
import { SafeAreaView, StyleSheet, Text } from 'react-native';

import { colors, spacing, typography } from '../../src/components/ui';

export default function PetTab(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.screen}>
      <Text style={typography.heading}>Pet</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.bg },
});
