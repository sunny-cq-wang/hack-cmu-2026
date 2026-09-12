import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { Auth0Provider } from 'react-native-auth0';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '../src/components/ui';
import { config } from '../src/lib/config';
// Side effect only: registers the in-memory API when EXPO_PUBLIC_MOCK_API=true.
import '../src/lib/mock';

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
        <Auth0Provider
          domain={config.auth0Domain}
          clientId={config.auth0ClientId}
          // The API verifies a plain bearer JWT via JWKS (ARCHITECTURE §1), so keep
          // classic tokens rather than v5's DPoP-bound ones.
          useDPoP={false}
        >
          <QueryClientProvider client={queryClient}>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
                animation: 'fade',
              }}
            />
          </QueryClientProvider>
        </Auth0Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
