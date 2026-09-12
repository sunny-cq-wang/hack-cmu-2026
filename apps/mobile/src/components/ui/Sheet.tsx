import { X } from 'lucide-react-native';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing, typography } from './theme';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Fraction of the screen the sheet is allowed to take. Defaults to 0.9. */
  maxHeightRatio?: number;
}

/**
 * A bottom sheet built on the platform `Modal` — no extra native dependency, which
 * matters because this app already needs a custom dev build for Auth0 and Rive.
 */
export function Sheet({ visible, onClose, title, children, maxHeightRatio = 0.9 }: SheetProps): React.JSX.Element {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismissArea} accessibilityLabel="Close" onPress={onClose} />
        <View style={[styles.sheet, { maxHeight: `${Math.round(maxHeightRatio * 100)}%`, paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.grabber} />
          {title ? (
            <View style={styles.header}>
              <Text style={typography.heading}>{title}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={12}>
                <X size={20} color={colors.textMuted} />
              </Pressable>
            </View>
          ) : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  dismissArea: { flex: 1 },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
