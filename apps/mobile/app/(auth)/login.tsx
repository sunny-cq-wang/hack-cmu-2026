/**
 * The sign-in screen — the app's front door for a signed-out user.
 *
 * Every real path here goes through Auth0 Universal Login: `signIn()` opens the
 * system browser. Both buttons pin `connection` to the tenant's database connection,
 * which keeps Universal Login on its own email/password form and suppresses the
 * social buttons an enabled social connection would otherwise render there.
 *
 * Social login is deliberately absent: demo accounts have to be provisioned ahead of
 * time for judges whose email addresses are not known in advance, and only a database
 * connection lets an account be created without the account holder present.
 *
 * Nothing from `react-native-auth0` may be imported here, even a type or an error
 * class: the package resolves its TurboModule at module-evaluation time and throws
 * in Expo Go (see `src/lib/auth.ts`). The cancelled-login check below therefore
 * duck-types `error.type` instead of using `instanceof WebAuthError`.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo, Button, colors, radius, spacing, typography } from '../../src/components/ui';
import { AUTH0_CONNECTION, useAuth, type SignInOptions } from '../../src/lib/auth';

/** Which button is spinning. Only one flow can be in flight at a time. */
type Pending = 'email' | 'signup' | 'demo' | null;

/**
 * Backing out of the browser is a normal thing to do, not an error worth a red
 * banner. `USER_CANCELLED` is the code react-native-auth0 reports for it.
 */
function isCancellation(cause: unknown): boolean {
  const type = (cause as { type?: unknown } | null)?.type;
  return type === 'USER_CANCELLED' || type === 'BROWSER_TERMINATED';
}

export default function Login(): React.JSX.Element {
  const router = useRouter();
  const { signIn } = useAuth();
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async (which: NonNullable<Pending>, opts: SignInOptions): Promise<void> => {
    setPending(which);
    setError(null);
    try {
      await signIn(opts);
      router.replace('/');
    } catch (cause) {
      if (!isCancellation(cause)) {
        setError(cause instanceof Error ? cause.message : 'Sign-in failed. Please try again.');
      }
    } finally {
      setPending(null);
    }
  };

  const busy = pending !== null;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <BrandLogo width={260} />
          <Text style={[typography.body, styles.pitch]}>
            Eat well together — your plate and your pet&apos;s bowl share one daily score.
          </Text>
        </View>

        <View style={styles.actions}>
          <Text style={[typography.label, styles.sectionLabel]}>Sign in</Text>

          <Button
            title="Sign in with email"
            onPress={() =>
              void start('email', {
                connection: AUTH0_CONNECTION.emailPassword,
                screenHint: 'login',
              })
            }
            loading={pending === 'email'}
            disabled={busy}
            testID="sign-in-email"
          />

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={typography.caption}>new here?</Text>
            <View style={styles.divider} />
          </View>

          <Button
            title="Create an account"
            onPress={() =>
              void start('signup', {
                connection: AUTH0_CONNECTION.emailPassword,
                screenHint: 'signup',
                fresh: true,
              })
            }
            variant="ghost"
            loading={pending === 'signup'}
            disabled={busy}
            testID="sign-up"
          />

          {error ? (
            <Text style={styles.error} testID="sign-in-error">
              {error}
            </Text>
          ) : null}

          <View style={styles.devBox}>
            <Text style={[typography.caption, styles.devNote]}>
              Just looking around? The demo account is already full of data — no sign-up.
            </Text>
            <Button
              title="Explore the demo"
              onPress={() => void start('demo', { demo: true })}
              variant="ghost"
              loading={pending === 'demo'}
              disabled={busy}
              testID="sign-in-demo"
            />
          </View>

          <Text style={[typography.caption, styles.disclaimer]}>
            Not medical or veterinary advice.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, padding: spacing.xl, justifyContent: 'space-between', gap: spacing.xl },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, minHeight: 200 },
  pitch: { textAlign: 'center', color: colors.textMuted, maxWidth: 300 },
  actions: { gap: spacing.md },
  sectionLabel: { textAlign: 'center' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  divider: { flex: 1, height: 1, backgroundColor: colors.border },
  error: { ...typography.caption, color: colors.drooping, textAlign: 'center' },
  devBox: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  devNote: { textAlign: 'center' },
  disclaimer: { textAlign: 'center' },
});
