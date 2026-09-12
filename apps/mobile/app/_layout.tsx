import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '../src/components/ui';
import { GoalReminders } from '../src/features/notifications';
import { requireAuth0 } from '../src/lib/auth';
import { config } from '../src/lib/config';
// Side effect only: registers the in-memory API when EXPO_PUBLIC_MOCK_API=true.
import '../src/lib/mock';

/**
 * Mounts the real `Auth0Provider` only when there is no dev session. `react-native-auth0`
 * is a TurboModule that Expo Go cannot load, and it throws the moment the module is
 * evaluated — so in a dev session it must never be imported at all. `config.devUser` is
 * inlined at bundle time, so this branch is constant for the life of the process.
 */
function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  if (config.devUser) {
    return <>{children}</>;
  }
  const { Auth0Provider } = requireAuth0();
  return (
    <Auth0Provider
      domain={config.auth0Domain}
      clientId={config.auth0ClientId}
      // The API verifies a plain bearer JWT via JWKS (ARCHITECTURE §1), so keep
      // classic tokens rather than v5's DPoP-bound ones.
      useDPoP={false}
    >
      {children}
    </Auth0Provider>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // `useToday()` opts back in; everything else stays quiet.
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout(): React.JSX.Element {
  // React Query's "window focus" has no meaning in React Native until AppState is
  // wired to the focus manager — without this, useToday() never refetches on resume.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
      focusManager.setFocused(status === 'active');
    });
    return () => subscription.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            {/*
              Local meal reminders. Renders nothing, asks for permission only after
              onboarding is complete and `/me/today` has loaded, and no-ops entirely
              on a dev build that predates `expo-notifications`.
            */}
            <GoalReminders />
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
                animation: 'fade',
              }}
            />
          </QueryClientProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
