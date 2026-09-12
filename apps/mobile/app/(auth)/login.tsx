import { useRouter } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { Button, colors, spacing, typography } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth';

export default function Login(): React.JSX.Element {
  const router = useRouter();
  const { signIn, isDevSession } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPress = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await signIn();
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
        <Text style={styles.logo}>🐾</Text>
        <Text style={typography.display}>PetPlate</Text>
        <Text style={[typography.body, styles.pitch]}>
          Eat well together — your plate and your pet&apos;s bowl share one daily score.
        </Text>
      </View>

      <View style={styles.actions}>
        <Button
          title={isDevSession ? 'Continue (dev user)' : 'Continue with Auth0'}
          onPress={() => void onPress()}
          loading={busy}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={[typography.caption, styles.disclaimer]}>Not medical or veterinary advice.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.xl, justifyContent: 'space-between' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  logo: { fontSize: 64 },
  pitch: { textAlign: 'center', color: colors.textMuted, maxWidth: 300 },
  actions: { gap: spacing.md },
  error: { ...typography.caption, color: colors.drooping, textAlign: 'center' },
  disclaimer: { textAlign: 'center' },
});
