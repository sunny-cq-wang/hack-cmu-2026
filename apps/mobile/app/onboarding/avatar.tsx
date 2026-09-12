import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, typography } from '../../src/components/ui';
import { AvatarGenerator } from '../../src/features/avatar';
import { useToday } from '../../src/lib/queries';

export default function OnboardingAvatar(): React.JSX.Element {
  const router = useRouter();
  // An invented pet arrives here with a description instead of a photo, so promising
  // "one photo" would be asking for something the next screen does not show.
  const { data: today } = useToday();
  const invented = today?.pet?.species === 'virtual';

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={typography.title}>Bring them to life</Text>
          <Text style={typography.caption}>
            {invented
              ? 'Your description becomes an avatar that thrives or droops with your shared daily score.'
              : 'One photo becomes an avatar that thrives or droops with your shared daily score.'}
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
