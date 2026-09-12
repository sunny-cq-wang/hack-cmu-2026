import { useRouter } from 'expo-router';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../../src/components/ui';
import { AvatarGenerator } from '../../src/features/avatar';

export default function OnboardingAvatar(): React.JSX.Element {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={typography.title}>Bring them to life</Text>
          <Text style={typography.caption}>
            One photo becomes an avatar that thrives or droops with your shared daily score.
          </Text>
        </View>
        <AvatarGenerator onReady={() => router.replace('/(tabs)/home')} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, gap: spacing.lg },
  header: { gap: spacing.xs },
});
