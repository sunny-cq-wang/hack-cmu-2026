/**
 * Sends one voice turn and plays the reply.
 *
 * Kept separate from the UI so the audio lifecycle (write cache file → play →
 * clear the avatar's `talking` flag) has one owner and cannot leak.
 */
import { useCallback, useRef, useState } from 'react';
import { File } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import * as Speech from 'expo-speech';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { VoiceTurnResponseSchema, type VoiceTurnResponse } from '../../lib/shared';
import { api } from '../../lib/api';
import { useSetToday } from '../../lib/queries';
import { avatarTalking } from '../avatar/talkingStore';

export type TurnPhase = 'idle' | 'sending' | 'speaking' | 'done' | 'error';

const MIME_EXTENSION: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
};

export interface UseVoiceTurn {
  phase: TurnPhase;
  response: VoiceTurnResponse | null;
  error: string | null;
  send: (input: { audioUri?: string; text?: string }) => Promise<void>;
  reset: () => void;
}

export function useVoiceTurn(): UseVoiceTurn {
  const [phase, setPhase] = useState<TurnPhase>('idle');
  const [response, setResponse] = useState<VoiceTurnResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const setToday = useSetToday();

  const stopAudio = useCallback(() => {
    avatarTalking.set(false);
    try {
      playerRef.current?.remove();
    } catch {
      /* already released */
    }
    playerRef.current = null;
  }, []);

  const speak = useCallback(
    async (turn: VoiceTurnResponse) => {
      setPhase('speaking');
      avatarTalking.set(true);

      // Device TTS fallback when the server could not synthesize (INTEGRATIONS §1.4 step 5).
      if (!turn.audioBase64) {
        Speech.speak(turn.reply, {
          onDone: () => {
            avatarTalking.set(false);
            setPhase('done');
          },
          onStopped: () => {
            avatarTalking.set(false);
            setPhase('done');
          },
          onError: () => {
            avatarTalking.set(false);
            setPhase('done');
          },
        });
        return;
      }

      try {
        const ext = MIME_EXTENSION[turn.audioMime ?? 'audio/mpeg'] ?? 'mp3';
        const path = `${FileSystem.cacheDirectory ?? ''}petplate-reply-${Date.now()}.${ext}`;
        await FileSystem.writeAsStringAsync(path, turn.audioBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const player = createAudioPlayer({ uri: path });
        playerRef.current = player;
        player.addListener('playbackStatusUpdate', (status) => {
          if (status.didJustFinish) {
            avatarTalking.set(false);
            setPhase('done');
          }
        });
        player.play();
      } catch {
        // Audio failed but we still have the text — read it with the device voice.
        Speech.speak(turn.reply);
        avatarTalking.set(false);
        setPhase('done');
      }
    },
    [],
  );

  const send = useCallback(
    async ({ audioUri, text }: { audioUri?: string; text?: string }) => {
      setError(null);
      setResponse(null);
      setPhase('sending');
      try {
        const form = new FormData();
        if (text?.trim()) {
          form.append('text', text.trim());
        } else if (audioUri) {
          // why: Expo's WinterCG `fetch` encodes multipart itself and accepts only a
          // string, a Blob, or something with `bytes()` — RN's {uri,name,type}
          // descriptor throws "Unsupported FormDataPart implementation", so the turn
          // never left the device. `File` from expo-file-system implements Blob.
          form.append('audio', new File(audioUri) as unknown as Blob);
        } else {
          throw new Error('Nothing to send');
        }

        const turn = await api('/voice/turn', {
          method: 'POST',
          body: form,
          multipart: true,
          schema: VoiceTurnResponseSchema,
        });

        setResponse(turn);
        // Keeps Home in sync when the turn logged a feeding (P4 task file §5).
        setToday(turn.today);
        await speak(turn);
      } catch (err) {
        setError((err as Error).message);
        setPhase('error');
      }
    },
    [setToday, speak],
  );

  const reset = useCallback(() => {
    stopAudio();
    Speech.stop();
    setResponse(null);
    setError(null);
    setPhase('idle');
  }, [stopAudio]);

  return { phase, response, error, send, reset };
}
