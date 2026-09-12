import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo, Button, colors, spacing, typography } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth';

export default function Login(): React.JSX.Element {
  const router = useRouter();
  const { signIn, isDevSession } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPress = async (fresh = false): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await signIn({ fresh });
      router.replace('/');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in was cancelled.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.hero}>
        <BrandLogo width={300} />
        <Text style={[typography.body, styles.pitch]}>
          Eat well together — your plate and your pet&apos;s bowl share one daily score.
        </Text>
      </View>

      <View style={styles.actions}>
        <Button
          title={isDevSession ? 'Continue as demo user' : 'Continue with Auth0'}
          onPress={() => void onPress(false)}
          loading={busy}
        />
        {isDevSession ? (
          <Button
            title="Start onboarding (new account)"
            onPress={() => void onPress(true)}
            loading={busy}
            variant="secondary"
          />
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {isDevSession ? (
          <Text style={[typography.caption, styles.disclaimer]}>
            New account leaves the seeded demo user on the server so you can come back to it.
          </Text>
        ) : null}
        <Text style={[typography.caption, styles.disclaimer]}>Not medical or veterinary advice.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.xl, justifyContent: 'space-between' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  pitch: { textAlign: 'center', color: colors.textMuted, maxWidth: 300 },
  actions: { gap: spacing.md },
  error: { ...typography.caption, color: colors.drooping, textAlign: 'center' },
  disclaimer: { textAlign: 'center' },
});
