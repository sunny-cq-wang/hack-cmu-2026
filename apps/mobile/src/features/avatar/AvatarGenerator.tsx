/**
 * "Meet your buddy." Uploads a pet photo, kicks off the Imagine pipeline and polls
 * until the three moods exist. Never blocks on video.
 *
 * Two modes share every line of the picking/polling logic:
 *  - `onboarding` — the first run. Nothing exists yet, so the server's `progress`
 *    flags are an exact description of what has landed.
 *  - `regenerate` — a redraw from a NEW photo, after onboarding. The server keeps
 *    the previous images on file until each replacement is stored (so Home never
 *    goes avatar-less, and a failed run changes nothing), which means `progress` is
 *    already all-true on the first poll. This mode therefore snapshots the URLs it
 *    started with and calls a mood done only once its URL actually changes.
 *
 * `['today']` is invalidated exactly once, when status flips to `ready` — never
 * mid-run — so the Home avatar swaps straight from the old images to the new ones.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { AvatarStatusSchema, type AvatarInfo, type AvatarStatus } from '../../lib/shared';
import { api, mediaUrl } from '../../lib/api';
import { queryKeys, useToday } from '../../lib/queries';
import { colors, radius } from '../../components/ui';
import { authHeadersSync } from './authHeadersSync';

const POLL_MS = 3000;
const PRESETS = ['sticker', 'watercolor', 'pixel', 'photoreal'] as const;
type Preset = (typeof PRESETS)[number];

type Phase = 'picking' | 'submitting' | 'polling' | 'ready' | 'failed';

const TILES = [
  { key: 'neutral', caption: 'okay' },
  { key: 'thriving', caption: 'thriving' },
  { key: 'drooping', caption: 'drooping' },
] as const;

type TileKey = (typeof TILES)[number]['key'];
/** The server-relative photo path per mood, as `/avatar/status` and `/me/today` report it. */
type TilePaths = Record<TileKey, string | null>;

const NO_PATHS: TilePaths = { neutral: null, thriving: null, drooping: null };

const pathsOf = (avatar: AvatarInfo | null | undefined): TilePaths => ({
  neutral: avatar?.neutralUrl ?? null,
  thriving: avatar?.thrivingUrl ?? null,
  drooping: avatar?.droopingUrl ?? null,
});

export type AvatarGeneratorMode = 'onboarding' | 'regenerate';

export interface AvatarGeneratorProps {
  /** "Continue" in onboarding, "Done" once a regeneration has landed. */
  onReady: () => void;
  mode?: AvatarGeneratorMode;
  /** Regenerate only: back out without starting (or keeping) anything. */
  onCancel?: () => void;
}

export function AvatarGenerator({
  onReady,
  mode = 'onboarding',
  onCancel,
}: AvatarGeneratorProps): React.JSX.Element {
  const { data: today } = useToday();
  const queryClient = useQueryClient();
  const petName = today?.pet?.name ?? 'your pet';
  const isVirtual = today?.pet?.species === 'virtual';
  const isRegenerate = mode === 'regenerate';

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>('sticker');
  const [phase, setPhase] = useState<Phase>('picking');
  const [status, setStatus] = useState<AvatarStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** URLs on screen when the run started — the "before" half of the diff above. */
  const baseline = useRef<TilePaths>(NO_PATHS);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const pickPhoto = useCallback(async (fromCamera: boolean) => {
    setError(null);
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(fromCamera ? 'Camera permission denied' : 'Photo library permission denied');
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.85, allowsEditing: true, aspect: [1, 1] })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.85, allowsEditing: true, aspect: [1, 1] });
    const asset = result.canceled ? null : result.assets[0];
    if (asset) setPhotoUri(asset.uri);
  }, []);

  const poll = useCallback(async () => {
    try {
      const next = await api('/avatar/status', { schema: AvatarStatusSchema });
      setStatus(next);
      if (next.status === 'ready') {
        setPhase('ready');
        // Only here: every replacement image exists, so Home crossfades old → new
        // instead of blanking while the pipeline is still mid-run.
        void queryClient.invalidateQueries({ queryKey: queryKeys.today });
        return;
      }
      if (next.status === 'failed') {
        setPhase('failed');
        setError(
          isRegenerate
            ? `Couldn't draw the new avatar. ${petName} kept the current one.`
            : 'Generation failed',
        );
        return;
      }
      pollTimer.current = setTimeout(() => void poll(), POLL_MS);
    } catch (err) {
      setError((err as Error).message);
      pollTimer.current = setTimeout(() => void poll(), POLL_MS);
    }
  }, [queryClient, isRegenerate, petName]);

  const generate = useCallback(async () => {
    setError(null);
    // Snapshot before the POST: from here on, "changed" is what marks a mood done.
    baseline.current = pathsOf(status?.avatar ?? today?.avatar);
    setPhase('submitting');
    try {
      const form = new FormData();
      form.append('stylePreset', preset);
      // Explicit, so a retry that re-uploads the same file is still a full redraw
      // rather than a resume of the run that just failed.
      if (isRegenerate) form.append('regenerate', '1');
      if (photoUri && !isVirtual) {
        // Same constraint as `useAnalyzeMeal`: Expo's WinterCG `fetch` rejects RN's
        // {uri,name,type} descriptor, so hand it a real Blob off disk.
        form.append('photo', new File(photoUri) as unknown as Blob);
      }
      await api('/avatar/generate', {
        method: 'POST',
        body: form,
        multipart: true,
        schema: AvatarStatusSchema.partial().passthrough(),
      });
      setPhase('polling');
      void poll();
    } catch (err) {
      setPhase('failed');
      setError((err as Error).message);
    }
  }, [preset, photoUri, isVirtual, isRegenerate, poll, status, today]);

  const progress = status?.progress;
  // Before the first poll answers there is no `status`; `today` already carries the
  // avatar that is on screen, which is exactly what regenerate mode wants to show.
  const paths = pathsOf(status?.avatar ?? today?.avatar);
  const currentUrl = paths.neutral ? mediaUrl(paths.neutral) : null;

  // The API returns server-relative paths ("/api/photos/<id>"), which `<Image>`
  // cannot resolve and which 401 without credentials — either way the tile renders
  // empty. `mediaUrl` makes them absolute and credentialed.
  const urlFor = (key: TileKey): string | null => (paths[key] ? mediaUrl(paths[key]) : null);

  const tileDone = (key: TileKey): boolean => {
    if (!paths[key]) return false;
    if (!isRegenerate) return progress?.[key] ?? false;
    // Run is over: whatever is on file is final, whether it is new or the mood the
    // server kept because its render failed. Never leave a tile spinning forever.
    if (phase === 'ready' || phase === 'failed') return true;
    // Mid-run, `progress` is all-true (the previous ids are still set), so the only
    // honest signal is the id — and therefore the URL — actually changing.
    return paths[key] !== baseline.current[key];
  };

  const canSubmit = isVirtual || Boolean(photoUri);

  return (
    <ScrollView contentContainerStyle={[styles.container, isRegenerate && styles.containerCompact]}>
      {!isRegenerate && <Text style={styles.title}>Meet your buddy.</Text>}
      <Text style={styles.subtitle}>
        {isRegenerate
          ? `A new photo redraws all three moods. ${petName} keeps the current avatar until the new one is ready. ~1–2 minutes.`
          : isVirtual
            ? `Grok Imagine will invent three moods of ${petName}.`
            : `Grok Imagine is drawing three moods of ${petName} from your photo. ~1–2 minutes.`}
      </Text>

      {phase === 'picking' && (
        <>
          {isRegenerate && (
            <View style={styles.currentRow}>
              <View style={styles.currentWrap}>
                <View style={[styles.current, styles.previewEmpty]}>
                  {currentUrl ? (
                    <Image
                      source={{ uri: currentUrl, headers: authHeadersSync() }}
                      style={styles.tileImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <Text style={styles.previewEmptyText}>None yet</Text>
                  )}
                </View>
                <Text style={styles.tileCaption}>now</Text>
              </View>
              <Text style={styles.arrow}>→</Text>
              <View style={styles.currentWrap}>
                <View style={[styles.current, styles.previewEmpty]}>
                  {photoUri ? (
                    <Image source={{ uri: photoUri }} style={styles.tileImage} resizeMode="cover" />
                  ) : (
                    <Text style={styles.previewEmptyText}>New photo</Text>
                  )}
                </View>
                <Text style={styles.tileCaption}>next</Text>
              </View>
            </View>
          )}

          {!isVirtual && (
            <>
              {!isRegenerate &&
                (photoUri ? (
                  <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="cover" />
                ) : (
                  <View style={[styles.preview, styles.previewEmpty]}>
                    <Text style={styles.previewEmptyText}>No photo yet</Text>
                  </View>
                ))}
              <View style={styles.row}>
                <Pressable style={styles.secondary} onPress={() => void pickPhoto(true)}>
                  <Text style={styles.secondaryText}>Take photo</Text>
                </Pressable>
                <Pressable style={styles.secondary} onPress={() => void pickPhoto(false)}>
                  <Text style={styles.secondaryText}>Choose photo</Text>
                </Pressable>
              </View>
            </>
          )}

          <Text style={styles.label}>Style</Text>
          <View style={styles.row}>
            {PRESETS.map((option) => (
              <Pressable
                key={option}
                style={[styles.chip, preset === option && styles.chipActive]}
                onPress={() => setPreset(option)}
              >
                <Text style={[styles.chipText, preset === option && styles.chipTextActive]}>{option}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={[styles.primary, !canSubmit && styles.primaryDisabled]}
            disabled={!canSubmit}
            onPress={() => void generate()}
          >
            <Text style={styles.primaryText}>
              {isRegenerate ? 'Redraw avatar' : isVirtual ? 'Use a virtual pet' : 'Generate'}
            </Text>
          </Pressable>

          {isRegenerate && onCancel && (
            <Pressable style={styles.secondary} onPress={onCancel}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
          )}
        </>
      )}

      {(phase === 'submitting' || phase === 'polling' || phase === 'ready' || phase === 'failed') && (
        <View style={styles.tiles}>
          {TILES.map((tile) => {
            const done = tileDone(tile.key);
            const url = urlFor(tile.key);
            // Regenerating: the outgoing image stays under the spinner, dimmed, so
            // the tile reads as "being replaced" rather than as an empty hole.
            const showsOld = !done && url !== null && isRegenerate;
            return (
              <View key={tile.key} style={styles.tileWrap}>
                <View style={styles.tile}>
                  {(done || showsOld) && url ? (
                    <Image
                      source={{ uri: `${url}`, headers: authHeadersSync() }}
                      style={[styles.tileImage, showsOld && styles.tileImageStale]}
                      resizeMode="contain"
                    />
                  ) : null}
                  {!done && <ActivityIndicator size="small" style={styles.tileSpinner} />}
                </View>
                <Text style={styles.tileCaption}>{tile.caption}</Text>
              </View>
            );
          })}
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {phase === 'ready' && (
        <Pressable style={styles.primary} onPress={onReady}>
          <Text style={styles.primaryText}>{isRegenerate ? 'Done' : 'Continue'}</Text>
        </Pressable>
      )}

      {phase === 'failed' && (
        <>
          <Pressable style={styles.primary} onPress={() => void generate()}>
            <Text style={styles.primaryText}>Try again</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={onCancel ?? onReady}>
            <Text style={styles.secondaryText}>
              {isRegenerate ? 'Keep the current avatar' : 'Continue with a placeholder'}
            </Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

// The app is dark-themed end to end (components/ui). These were authored against a
// light background, which left the title black-on-black once the screen was mounted
// inside the dark onboarding shell.
const styles = StyleSheet.create({
  container: { padding: 24, gap: 14 },
  // Inside the Pet-tab sheet the surrounding chrome already supplies the padding.
  containerCompact: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 8 },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 15, color: colors.textMuted, lineHeight: 21 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginTop: 6 },
  preview: { width: 180, height: 180, borderRadius: radius.lg, alignSelf: 'center' },
  previewEmpty: { backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  previewEmptyText: { color: colors.textFaint },
  row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.cardRaised },
  chipActive: { backgroundColor: colors.thriving },
  chipText: { color: colors.text, fontWeight: '600' },
  chipTextActive: { color: colors.bg },
  primary: { backgroundColor: colors.thriving, paddingVertical: 15, borderRadius: radius.md, alignItems: 'center' },
  primaryDisabled: { opacity: 0.4 },
  primaryText: { color: colors.bg, fontWeight: '700', fontSize: 16 },
  secondary: {
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    backgroundColor: colors.cardRaised,
    alignItems: 'center',
  },
  secondaryText: { color: colors.text, fontWeight: '600' },
  tiles: { flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  tileWrap: { flex: 1, gap: 6 },
  tile: {
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tileImage: { width: '100%', height: '100%' },
  /** The image being replaced: still readable, clearly not the final result. */
  tileImageStale: { opacity: 0.28 },
  tileSpinner: { position: 'absolute' },
  tileCaption: { textAlign: 'center', fontSize: 12, color: colors.textMuted },
  currentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'center' },
  currentWrap: { gap: 6 },
  current: {
    width: 104,
    height: 104,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  arrow: { color: colors.textFaint, fontSize: 20, marginBottom: 18 },
  error: { color: colors.drooping, fontSize: 13 },
});
