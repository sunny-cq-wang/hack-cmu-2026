/**
 * Onboarding: "Meet your buddy." Uploads the owner's pet photo, kicks off the
 * Imagine pipeline and polls until the three moods exist. Never blocks on video.
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
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { AvatarStatusSchema, type AvatarStatus } from '../../lib/shared';
import { api, mediaUrl } from '../../lib/api';
import { useToday } from '../../lib/queries';
import { colors, radius } from '../../components/ui';
import { authHeadersSync } from './authHeadersSync';

const POLL_MS = 3000;
const PRESETS = ['sticker', 'watercolor', 'pixel'] as const;
type Preset = (typeof PRESETS)[number];

type Phase = 'picking' | 'submitting' | 'polling' | 'ready' | 'failed';

const TILES = [
  { key: 'neutral', caption: 'okay' },
  { key: 'thriving', caption: 'thriving' },
  { key: 'drooping', caption: 'drooping' },
] as const;

export function AvatarGenerator({ onReady }: { onReady: () => void }): React.JSX.Element {
  const { data: today } = useToday();
  const petName = today?.pet?.name ?? 'your pet';
  const isVirtual = today?.pet?.species === 'virtual';

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>('sticker');
  const [phase, setPhase] = useState<Phase>('picking');
  const [status, setStatus] = useState<AvatarStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        return;
      }
      if (next.status === 'failed') {
        setPhase('failed');
        setError('Generation failed');
        return;
      }
      pollTimer.current = setTimeout(() => void poll(), POLL_MS);
    } catch (err) {
      setError((err as Error).message);
      pollTimer.current = setTimeout(() => void poll(), POLL_MS);
    }
  }, []);

  const generate = useCallback(async () => {
    setError(null);
    setPhase('submitting');
    try {
      const form = new FormData();
      form.append('stylePreset', preset);
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
  }, [preset, photoUri, isVirtual, poll]);

  const progress = status?.progress;
  const avatar = status?.avatar ?? null;
  // The API returns server-relative paths ("/api/photos/<id>"), which `<Image>`
  // cannot resolve and which 401 without credentials — either way the tile renders
  // empty. `mediaUrl` makes them absolute and credentialed.
  const urlFor = (key: (typeof TILES)[number]['key']): string | null => {
    if (!avatar) return null;
    const path =
      key === 'neutral' ? avatar.neutralUrl : key === 'thriving' ? avatar.thrivingUrl : avatar.droopingUrl;
    return path ? mediaUrl(path) : null;
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Meet your buddy.</Text>
      <Text style={styles.subtitle}>
        {isVirtual
          ? `Grok Imagine will invent three moods of ${petName}.`
          : `Grok Imagine is drawing three moods of ${petName} from your photo. ~1–2 minutes.`}
      </Text>

      {phase === 'picking' && (
        <>
          {!isVirtual && (
            <>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="cover" />
              ) : (
                <View style={[styles.preview, styles.previewEmpty]}>
                  <Text style={styles.previewEmptyText}>No photo yet</Text>
                </View>
              )}
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
            style={[styles.primary, !isVirtual && !photoUri && styles.primaryDisabled]}
            disabled={!isVirtual && !photoUri}
            onPress={() => void generate()}
          >
            <Text style={styles.primaryText}>{isVirtual ? 'Use a virtual pet' : 'Generate'}</Text>
          </Pressable>
        </>
      )}

      {(phase === 'submitting' || phase === 'polling' || phase === 'ready' || phase === 'failed') && (
        <View style={styles.tiles}>
          {TILES.map((tile) => {
            const done = progress?.[tile.key] ?? false;
            const url = urlFor(tile.key);
            return (
              <View key={tile.key} style={styles.tileWrap}>
                <View style={styles.tile}>
                  {done && url ? (
                    <Image
                      source={{ uri: `${url}`, headers: authHeadersSync() }}
                      style={styles.tileImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <ActivityIndicator size="small" />
                  )}
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
          <Text style={styles.primaryText}>Continue</Text>
        </Pressable>
      )}

      {phase === 'failed' && (
        <>
          <Pressable style={styles.primary} onPress={() => void generate()}>
            <Text style={styles.primaryText}>Try again</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={onReady}>
            <Text style={styles.secondaryText}>Continue with a placeholder</Text>
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
  tileCaption: { textAlign: 'center', fontSize: 12, color: colors.textMuted },
  error: { color: colors.drooping, fontSize: 13 },
});
