/**
 * Log tab — `idle → capturing → analyzing → reviewing → saving → done`
 * (plan §8 / tasks/P1_MOBILE_CORE.md §4).
 *
 * The whole flow is one discriminated union in `useState`. Every transition is a
 * single `setState` in this file; the feature components only report events.
 */
import type { MealDraft } from '@petplate/shared';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, colors, radius, spacing, typography } from '../../src/components/ui';
import { AnalyzeSheet, CameraCapture, MealList, emptyDraft } from '../../src/features/meals';
import { isApiError } from '../../src/lib/api';
import type { MealCreateInput } from '../../src/lib/contracts';
import { log } from '../../src/lib/log';
import { useAnalyzeMeal, useCreateMeal } from '../../src/lib/queries';

type LogState =
  | { status: 'idle' }
  /** Shutter pressed or a gallery photo chosen; resizing to 1024 px / q0.8. */
  | { status: 'capturing' }
  | { status: 'analyzing'; photoUri: string }
  | { status: 'reviewing'; photoUri: string | null; draft: MealDraft; notice: string | null }
  | { status: 'saving'; photoUri: string | null; draft: MealDraft; notice: string | null }
  /** `['today']` has been written by `useCreateMeal`; bounce to Home. */
  | { status: 'done' };

/** The exact copy the brief asks for when the vision call gives us nothing. */
const MANUAL_FALLBACK_NOTICE = "Couldn't analyze — add items manually";

/**
 * `UPSTREAM_TIMEOUT` (and its sibling `UPSTREAM_ERROR`) are expected on a bad
 * conference wifi, so they get the canned line. Anything else is worth showing,
 * but it still lands in `reviewing` — the user should never lose their photo.
 */
function analyzeNotice(cause: unknown): string {
  if (isApiError(cause) && cause.code !== 'UPSTREAM_TIMEOUT' && cause.code !== 'UPSTREAM_ERROR') {
    return `${cause.message} Add items manually, or try analyzing again.`;
  }
  return MANUAL_FALLBACK_NOTICE;
}

/** The captured photo, dimmed, behind whatever the flow is doing to it. */
function PhotoBackdrop({ uri, children }: { uri: string | null; children?: React.ReactNode }): React.JSX.Element {
  return (
    <View style={styles.backdrop}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
      <View style={[StyleSheet.absoluteFill, styles.dim]} />
      {children}
    </View>
  );
}

export default function LogTab(): React.JSX.Element {
  const router = useRouter();
  const analyzeMeal = useAnalyzeMeal();
  const createMeal = useCreateMeal();

  const [state, setState] = useState<LogState>({ status: 'idle' });
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Bumped on every new analysis and on cancel, so a request the user walked away
  // from cannot drag them back into `reviewing` when it finally resolves.
  const analysisId = useRef(0);

  // analyzing → reviewing, both ways.
  const startAnalysis = useCallback(
    (photoUri: string) => {
      analysisId.current += 1;
      const requestId = analysisId.current;
      setCaptureError(null);
      setSaveError(null);
      setState({ status: 'analyzing', photoUri });
      analyzeMeal.mutate(
        { uri: photoUri },
        {
          onSuccess: (draft) => {
            if (analysisId.current !== requestId) {
              return;
            }
            setState({ status: 'reviewing', photoUri, draft, notice: null });
          },
          onError: (cause) => {
            log.warn('meals', 'analyze failed — falling back to a manual draft', {
              code: isApiError(cause) ? cause.code : 'UNKNOWN',
            });
            if (analysisId.current !== requestId) {
              return;
            }
            setState({ status: 'reviewing', photoUri, draft: emptyDraft(), notice: analyzeNotice(cause) });
          },
        },
      );
    },
    [analyzeMeal],
  );

  // done → Home. The avatar animates off the cache write the mutation already did.
  useEffect(() => {
    if (state.status !== 'done') {
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setState({ status: 'idle' });
    router.replace('/(tabs)/home');
  }, [state.status, router]);

  // reviewing → saving → done, or back to reviewing with the failure.
  const confirm = (input: MealCreateInput): void => {
    if (state.status !== 'reviewing') {
      return;
    }
    const { photoUri, draft, notice } = state;
    setSaveError(null);
    setState({ status: 'saving', photoUri, draft, notice });
    createMeal.mutate(input, {
      onSuccess: () => setState({ status: 'done' }),
      onError: (cause) => {
        setSaveError(isApiError(cause) ? cause.message : 'Could not save that meal. Try again.');
        setState({ status: 'reviewing', photoUri, draft, notice });
      },
    });
  };

  const cancel = (): void => {
    analysisId.current += 1;
    setSaveError(null);
    setState({ status: 'idle' });
  };

  if (state.status === 'analyzing') {
    return (
      <SafeAreaView style={styles.screen}>
        <PhotoBackdrop uri={state.photoUri}>
          <View style={styles.analyzing}>
            <ActivityIndicator color={colors.thriving} />
            <Text style={typography.heading}>Reading your plate…</Text>
            <Text style={typography.caption}>Grok looks at the photo, USDA prices it.</Text>
            <Button title="Cancel" variant="ghost" onPress={cancel} fullWidth={false} />
          </View>
        </PhotoBackdrop>
      </SafeAreaView>
    );
  }

  if (state.status === 'reviewing' || state.status === 'saving') {
    const { photoUri } = state;
    return (
      <SafeAreaView style={styles.screen}>
        <PhotoBackdrop uri={photoUri} />
        <AnalyzeSheet
          visible
          draft={state.draft}
          notice={state.notice}
          error={saveError}
          saving={state.status === 'saving'}
          onRetryAnalysis={photoUri === null ? null : () => startAnalysis(photoUri)}
          onCancel={cancel}
          onConfirm={confirm}
        />
      </SafeAreaView>
    );
  }

  // idle and capturing share a tree; `busy` locks the shutter and dims the preview.
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.cameraPane}>
        <CameraCapture
          busy={state.status === 'capturing'}
          onCaptureStart={() => {
            setCaptureError(null);
            setState({ status: 'capturing' });
          }}
          onCaptured={startAnalysis}
          onCaptureFailed={(message) => {
            setCaptureError(message);
            setState({ status: 'idle' });
          }}
        />
      </View>

      <ScrollView style={styles.listPane} contentContainerStyle={styles.listContent}>
        {captureError ? <Text style={styles.error}>{captureError}</Text> : null}
        <Text style={typography.label}>Today</Text>
        <MealList />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  cameraPane: { flex: 1, margin: spacing.lg, marginBottom: spacing.sm },
  listPane: { maxHeight: '42%' },
  listContent: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  backdrop: { flex: 1, margin: spacing.lg, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.card },
  dim: { backgroundColor: colors.overlay },
  analyzing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  error: { ...typography.caption, color: colors.drooping },
});
