import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button, colors, spacing, typography } from '../src/components/ui';
import { useAuth } from '../src/lib/auth';
import { useMe } from '../src/lib/queries';

/**
 * The only routing decision in the app: signed out → login, signed in but not set up
 * → onboarding, otherwise → the tabs.
 */
export default function Index(): React.JSX.Element {
  const { isAuthenticated, isLoading } = useAuth();
  const me = useMe();

  if (isLoading) {
    return <Booting />;
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  if (me.isPending) {
    return <Booting />;
  }

  if (me.isError) {
    return (
      <View style={styles.centered}>
        <Text style={typography.heading}>Couldn&apos;t reach Kibble & Kale</Text>
        <Text style={[typography.caption, styles.reason]}>{me.error.message}</Text>
        <Button title="Try again" onPress={() => void me.refetch()} fullWidth={false} />
      </View>
    );
  }

  return <Redirect href={me.data.onboardingComplete ? '/(tabs)/home' : '/onboarding/profile'} />;
}

function Booting(): React.JSX.Element {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.thriving} />
      <Text style={typography.caption}>Waking up Kibble & Kale…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.bg,
  },
  reason: { textAlign: 'center' },
});
