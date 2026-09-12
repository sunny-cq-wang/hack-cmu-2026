/**
 * TODO(P1): owns this route; it renders P4's `AvatarGenerator` (P1 §4).
 */
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AvatarGenerator } from '../../src/features/avatar';

export default function OnboardingAvatarScreen(): React.JSX.Element {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <AvatarGenerator onReady={() => router.replace('/')} />
    </SafeAreaView>
  );
}
