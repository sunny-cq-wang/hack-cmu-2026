// The Pet tab is P3's screen; this route mounts it (tasks/P1_MOBILE_CORE.md §4) and
// composes the avatar-regeneration sheet around it. "New photo" lives on the edit
// form so it no longer covers Save pet.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '../../src/components/ui';
import { RegenerateAvatarSheet } from '../../src/features/avatar';
import { PetScreen } from '../../src/features/pet';

export default function PetTab(): React.JSX.Element {
  const [regenerating, setRegenerating] = useState(false);

  return (
    <View style={styles.screen}>
      <PetScreen onNewPhoto={() => setRegenerating(true)} />
      <RegenerateAvatarSheet visible={regenerating} onClose={() => setRegenerating(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
});
