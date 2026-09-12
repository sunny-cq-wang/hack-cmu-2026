/**
 * Swipe a row left to delete it.
 *
 * Built on `PanResponder` + the classic `Animated` API on purpose: it needs no
 * worklets and no gesture-handler root beyond the one `app/_layout.tsx` already
 * mounts, so it behaves the same in the Expo dev build and in a plain bundle.
 *
 * Candidate for `components/ui` once a second feature needs it.
 */
import { Trash2 } from 'lucide-react-native';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../../components/ui';

export interface SwipeToDeleteProps {
  children: React.ReactNode;
  onDelete: () => void;
  /** Blocks the gesture while a delete is already in flight. */
  disabled?: boolean;
  actionLabel?: string;
}

/** Drag further left than this and the row is removed on release. */
const DELETE_AT_PX = -96;
const CLAIM_AT_PX = -8;

export function SwipeToDelete({
  children,
  onDelete,
  disabled = false,
  actionLabel = 'Delete',
}: SwipeToDeleteProps): React.JSX.Element {
  const translateX = useRef(new Animated.Value(0)).current;

  // The responder is created once, so the live props are read through refs.
  const onDeleteRef = useRef(onDelete);
  const disabledRef = useRef(disabled);
  useEffect(() => {
    onDeleteRef.current = onDelete;
    disabledRef.current = disabled;
  }, [onDelete, disabled]);

  const responder = useMemo(() => {
    const settle = (): void => {
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
    };

    return PanResponder.create({
      // Only claim clearly horizontal drags, so the surrounding ScrollView keeps working.
      onMoveShouldSetPanResponder: (_event, gesture) =>
        !disabledRef.current && gesture.dx < CLAIM_AT_PX && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderMove: (_event, gesture) => translateX.setValue(Math.min(0, gesture.dx)),
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dx <= DELETE_AT_PX) {
          Animated.timing(translateX, { toValue: -600, duration: 140, useNativeDriver: true }).start(() => {
            onDeleteRef.current();
            translateX.setValue(0);
          });
          return;
        }
        settle();
      },
      onPanResponderTerminate: settle,
    });
  }, [translateX]);

  return (
    <View style={styles.wrapper}>
      <View style={styles.action} pointerEvents="none">
        <Trash2 size={18} color={colors.bg} />
        <Text style={styles.actionLabel}>{actionLabel}</Text>
      </View>
      <Animated.View style={{ transform: [{ translateX }] }} {...responder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { borderRadius: radius.lg, overflow: 'hidden' },
  action: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.drooping,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    paddingRight: spacing.lg,
  },
  actionLabel: { ...typography.label, color: colors.bg },
});
