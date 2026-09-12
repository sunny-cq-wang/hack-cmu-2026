/**
 * Sends one voice turn and plays the reply.
 *
 * Kept separate from the UI so the audio lifecycle (write cache file → play →
 * clear the avatar's `talking` flag) has one owner and cannot leak.
 */
import { useCallback, useEffect, useState } from 'react';
import { File } from 'expo-file-system';
import { VoiceTurnResponseSchema, type VoiceTurnResponse } from '../../lib/shared';
import { api } from '../../lib/api';
import { log } from '../../lib/log';
import { useSetToday } from '../../lib/queries';
import { playReply, stopReplyAudio } from './playReply';

export type TurnPhase = 'idle' | 'sending' | 'speaking' | 'done' | 'error';

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
  const setToday = useSetToday();

  useEffect(
    () => () => {
      stopReplyAudio();
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
          const clip = new File(audioUri);
          // A clip the encoder never wrote is a header-only file at best; the
          // server would just answer "I couldn't hear that" after a round trip.
          if (!clip.exists || clip.size === 0) {
            throw new Error('That clip was empty — hold the button while you talk, or type it instead.');
          }
          log.info('voice', 'sending clip', { bytes: clip.size, uri: audioUri });
          form.append('audio', clip as unknown as Blob);
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
        await playReply({
          audioBase64: turn.audioBase64,
          audioMime: turn.audioMime,
          text: turn.reply,
          onStart: () => setPhase('speaking'),
          onEnd: () => setPhase('done'),
        });
      } catch (err) {
        setError((err as Error).message);
        setPhase('error');
      }
    },
    [setToday],
  );

  const reset = useCallback(() => {
    stopReplyAudio();
    setResponse(null);
    setError(null);
    setPhase('idle');
  }, []);

  return { phase, response, error, send, reset };
}
