/**
 * One shared player for Grok TTS (and the device-voice fallback).
 * Voice-sheet turns and tap-to-talk both go through here so they cannot overlap.
 */
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import * as Speech from 'expo-speech';

import { log } from '../../lib/log';
import { avatarTalking } from '../avatar/talkingStore';
import { enterPlaybackModeAsync } from './audioSession';

const MIME_EXTENSION: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
};

/** Bumped on every stop/play so a stale request cannot restart an old clip. */
let playGen = 0;
let player: AudioPlayer | null = null;

function releasePlayer(): void {
  const current = player;
  player = null;
  if (!current) return;
  try {
    current.pause();
  } catch {
    /* already gone */
  }
  try {
    current.remove();
  } catch {
    /* already released */
  }
}

export function stopReplyAudio(): void {
  playGen += 1;
  avatarTalking.set(false);
  Speech.stop();
  releasePlayer();
}

function speakOnDevice(text: string, gen: number, onEnd?: () => void): void {
  const finish = (): void => {
    if (gen !== playGen) return;
    avatarTalking.set(false);
    onEnd?.();
  };
  Speech.speak(text, {
    language: 'en-GB',
    onDone: finish,
    onStopped: finish,
    onError: () => {
      // en-GB is missing on some Androids — try generic English before giving up.
      Speech.speak(text, {
        language: 'en',
        onDone: finish,
        onStopped: finish,
        onError: finish,
      });
    },
  });
}

export async function playReply(input: {
  audioBase64: string | null;
  audioMime: string | null;
  text: string;
  onStart?: () => void;
  onEnd?: () => void;
}): Promise<void> {
  const gen = ++playGen;
  Speech.stop();
  releasePlayer();
  input.onStart?.();
  avatarTalking.set(true);

  const finish = (): void => {
    if (gen !== playGen) return;
    avatarTalking.set(false);
    input.onEnd?.();
  };

  if (!input.audioBase64) {
    speakOnDevice(input.text, gen, input.onEnd);
    return;
  }

  try {
    const ext = MIME_EXTENSION[input.audioMime ?? 'audio/mpeg'] ?? 'mp3';
    const path = `${FileSystem.cacheDirectory ?? ''}kibble-reply-${Date.now()}.${ext}`;
    await FileSystem.writeAsStringAsync(path, input.audioBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (gen !== playGen) return;

    await enterPlaybackModeAsync();
    if (gen !== playGen) return;

    const next = createAudioPlayer({ uri: path });
    player = next;
    next.volume = 1;
    next.muted = false;
    let started = false;
    const tryPlay = (): void => {
      if (started || gen !== playGen) return;
      started = true;
      log.info('voice', 'playing grok clip', { path, gen });
      next.play();
    };
    next.addListener('playbackStatusUpdate', (status) => {
      if (gen !== playGen) return;
      if (status.didJustFinish) {
        finish();
        return;
      }
      if (status.isLoaded) tryPlay();
    });
    tryPlay();
  } catch (err) {
    log.warn('voice', 'grok audio playback failed, using device voice', {
      message: err instanceof Error ? err.message : String(err),
    });
    if (gen !== playGen) return;
    speakOnDevice(input.text, gen, input.onEnd);
  }
}
