// The Pet tab is P3's screen; this route mounts it (tasks/P1_MOBILE_CORE.md §4) and
// composes the avatar-regeneration affordance around it. `PetScreen` itself is owned
// elsewhere, so everything added here sits strictly outside it: a floating button in
// an absolutely-positioned overlay, plus the sheet it opens.
import { Camera } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../../src/components/ui';
import { RegenerateAvatarSheet } from '../../src/features/avatar';
import { PetScreen } from '../../src/features/pet';

export default function PetTab(): React.JSX.Element {
  const [regenerating, setRegenerating] = useState(false);

  return (
    <View style={styles.screen}>
      <PetScreen />

      <View style={styles.floatSlot} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Regenerate avatar from a new photo"
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          onPress={() => setRegenerating(true)}
        >
          <Camera size={18} color={colors.bg} />
          <Text style={styles.fabText}>New photo</Text>
        </Pressable>
      </View>

      <RegenerateAvatarSheet visible={regenerating} onClose={() => setRegenerating(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  floatSlot: { position: 'absolute', left: 0, right: 0, bottom: spacing.xl, alignItems: 'center' },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.thriving,
  },
  fabPressed: { opacity: 0.85 },
  fabText: { color: colors.bg, fontWeight: '700', fontSize: 15 },
});
