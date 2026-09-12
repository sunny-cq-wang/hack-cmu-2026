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
import * as ImagePicker from 'expo-image-picker';
import { AvatarStatusSchema, type AvatarStatus } from '../../lib/shared';
import { api } from '../../lib/api';
import { useToday } from '../../lib/queries';
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
        // RN's FormData accepts this file descriptor shape.
        form.append('photo', {
          uri: photoUri,
          name: 'pet.jpg',
          type: 'image/jpeg',
        } as unknown as Blob);
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
  const urlFor = (key: (typeof TILES)[number]['key']): string | null => {
    if (!avatar) return null;
    if (key === 'neutral') return avatar.neutralUrl;
    if (key === 'thriving') return avatar.thrivingUrl;
    return avatar.droopingUrl;
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

const styles = StyleSheet.create({
  container: { padding: 24, gap: 14 },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 15, color: '#555', lineHeight: 21 },
  label: { fontSize: 13, fontWeight: '600', color: '#666', marginTop: 6 },
  preview: { width: 180, height: 180, borderRadius: 16, alignSelf: 'center' },
  previewEmpty: { backgroundColor: '#EEF1F5', alignItems: 'center', justifyContent: 'center' },
  previewEmptyText: { color: '#8A94A6' },
  row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: '#EEF1F5' },
  chipActive: { backgroundColor: '#2B2D42' },
  chipText: { color: '#2B2D42', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  primary: { backgroundColor: '#2B2D42', paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  primaryDisabled: { opacity: 0.4 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondary: { paddingVertical: 13, paddingHorizontal: 16, borderRadius: 14, backgroundColor: '#EEF1F5', alignItems: 'center' },
  secondaryText: { color: '#2B2D42', fontWeight: '600' },
  tiles: { flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  tileWrap: { flex: 1, gap: 6 },
  tile: { aspectRatio: 1, borderRadius: 12, backgroundColor: '#EEF1F5', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  tileImage: { width: '100%', height: '100%' },
  tileCaption: { textAlign: 'center', fontSize: 12, color: '#666' },
  error: { color: '#B3261E', fontSize: 13 },
});
