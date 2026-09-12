/**
 * The Home dashboard — the seven items of `tasks/P1_MOBILE_CORE.md` §4, top to bottom:
 * avatar, score ring, streak badge, today's totals, adjustment toasts, the floating
 * talk button, and the disclaimer footer.
 *
 * Everything on screen is read from `GET /me/today`. `useToday()` already refetches on
 * window focus, so coming back from the Log tab shows the new score without a manual
 * refresh (see `src/lib/queries.ts`). Pull-to-refresh is the explicit override.
 */
import type { TodaySummary } from '@petplate/shared';
import { RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Skeleton, colors, radius, spacing, typography } from '../../src/components/ui';
import { PetAvatar } from '../../src/features/avatar';
import { AdjustmentToasts, ScoreRing, StreakBadge, TodayTotals } from '../../src/features/home';
import { TalkButton } from '../../src/features/voice';
import { useToday } from '../../src/lib/queries';

const AVATAR_SIZE = 220;
const RING_SIZE = 120;

export default function HomeTab(): React.JSX.Element {
  const today = useToday();

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={today.isRefetching}
            onRefresh={() => {
              void today.refetch();
            }}
            tintColor={colors.thriving}
            colors={[colors.thriving]}
          />
        }
      >
        {/* 1 — P4's avatar; it reads `useToday()` itself and owns its own loading state. */}
        <PetAvatar size={AVATAR_SIZE} />

        {today.isPending ? (
          <TodaySkeleton />
        ) : today.isError ? (
          <TodayError message={today.error.message} retrying={today.isFetching} onRetry={() => void today.refetch()} />
        ) : (
          <TodayBody data={today.data} />
        )}

        {/* 7 — disclaimer footer. */}
        <Text style={styles.disclaimer}>Not medical or veterinary advice.</Text>
      </ScrollView>

      {/* 6 — P4's push-to-talk button, floating bottom-right. */}
      <View style={styles.talkSlot} pointerEvents="box-none">
        <TalkButton />
      </View>
    </SafeAreaView>
  );
}

function TodayBody({ data }: { data: TodaySummary }): React.JSX.Element {
  return (
    <>
      {/* 2 — combined score ring. */}
      <ScoreRing combined={data.combined} state={data.avatarState} size={RING_SIZE} />

      {/* 3 — streak. */}
      <StreakBadge length={data.streak.length} todayCounted={data.streak.todayCounted} />

      {/* 4 — the two progress rows; the pet row taps through to the Pet tab. */}
      <TodayTotals human={data.human} pet={data.pet} />

      {/* 5 — adjustment messages from the adaptive loops, dismissible for this session. */}
      <AdjustmentToasts items={data.adjustments} />
    </>
  );
}

/** First load only — a refetch keeps the previous day on screen. */
function TodaySkeleton(): React.JSX.Element {
  return (
    <View style={styles.skeleton} accessibilityRole="progressbar" accessibilityLabel="Loading today">
      <Skeleton width={RING_SIZE} height={RING_SIZE} borderRadius={RING_SIZE / 2} />
      <Skeleton width={160} height={40} borderRadius={radius.pill} />
      <Skeleton height={104} borderRadius={radius.lg} />
      <Skeleton height={104} borderRadius={radius.lg} />
    </View>
  );
}

function TodayError({
  message,
  retrying,
  onRetry,
}: {
  message: string;
  retrying: boolean;
  onRetry: () => void;
}): React.JSX.Element {
  return (
    <Card style={styles.error} testID="today-error">
      <Text style={typography.heading}>Couldn&apos;t load today</Text>
      <Text style={typography.caption}>{message}</Text>
      <Button title="Try again" onPress={onRetry} loading={retrying} variant="secondary" />
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 3,
    gap: spacing.lg,
    alignItems: 'center',
  },
  skeleton: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.lg },
  error: { alignSelf: 'stretch', borderColor: colors.drooping },
  disclaimer: { ...typography.caption, textAlign: 'center', marginTop: spacing.sm },
  talkSlot: { position: 'absolute', right: spacing.lg, bottom: spacing.xl },
});
