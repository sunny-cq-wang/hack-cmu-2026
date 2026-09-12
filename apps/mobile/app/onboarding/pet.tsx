import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Segmented, colors, spacing, typography, type SegmentedOption } from '../../src/components/ui';
import { PetForm } from '../../src/features/pet';

/**
 * Two ways in, and the choice decides what the avatar is drawn from:
 *  - `real` — a dog or cat at home. The next screen wants a photo.
 *  - `virtual` — a pet invented here in words. There is no photo, so the
 *    description the owner types IS the source Grok Imagine draws the first image
 *    from; every later mood is edited from that image, not from the text again.
 */
type PetPath = 'real' | 'virtual';

const PATH_OPTIONS: SegmentedOption<PetPath>[] = [
  { label: 'A pet at home', value: 'real', description: 'A dog or cat. You add a photo on the next screen.' },
  {
    label: 'Invent one',
    value: 'virtual',
    description: 'Describe a pet in words and Grok Imagine draws it. No photo, no weigh-ins.',
  },
];

const CAPTION: Record<PetPath, string> = {
  real: 'Their weight and food set the portion we track against.',
  virtual: 'Say what they look like — that description is what your avatar gets drawn from.',
};

export default function OnboardingPet(): React.JSX.Element {
  const router = useRouter();
  const [path, setPath] = useState<PetPath>('real');

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={typography.title}>Your pet</Text>
          <Text style={typography.caption}>{CAPTION[path]}</Text>
        </View>
        <Segmented orientation="vertical" options={PATH_OPTIONS} value={path} onChange={setPath} />
        {/*
          Remounted per path: the form seeds its species, breed and description from
          props on first render, so switching paths has to start it over rather than
          leave a dog's weight fields filled in behind a described dragon.
        */}
        <PetForm
          key={path}
          initialSpecies={path === 'virtual' ? 'virtual' : 'dog'}
          speciesOptions={path === 'virtual' ? ['virtual'] : ['dog', 'cat']}
          onSaved={() => router.push('/onboarding/avatar')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, gap: spacing.lg },
  header: { gap: spacing.xs },
});
