import { useRouter } from 'expo-router';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../../src/components/ui';
import { PetForm } from '../../src/features/pet';

export default function OnboardingPet(): React.JSX.Element {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={typography.title}>Your pet</Text>
          <Text style={typography.caption}>
            No pet at home? Skip and PetPlate gives you Pixel, a virtual one.
          </Text>
        </View>
        <PetForm onSaved={() => router.push('/onboarding/avatar')} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, gap: spacing.lg },
  header: { gap: spacing.xs },
});
