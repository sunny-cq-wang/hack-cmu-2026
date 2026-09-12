/**
 * Tap-to-talk: make a sound *now*, then upgrade to Grok TTS when it arrives.
 *
 * Device speech runs first so a slow or failed `/voice/speak` is never silence.
 * A generation counter drops stale fetches when the user spam-taps.
 */
import * as Speech from 'expo-speech';
import { z } from 'zod';

import { api } from '../../lib/api';
import { log } from '../../lib/log';
import { enterPlaybackModeAsync } from './audioSession';
import { playReply, stopReplyAudio } from './playReply';

const SpeakResponseSchema = z.object({
  reply: z.string(),
  audioBase64: z.string().nullable(),
  audioMime: z.string().nullable(),
});

let tapGen = 0;
let allowDevice = true;
let cachedVoice: { language: string; identifier?: string } | null = null;

async function pickDeviceVoice(): Promise<{ language: string; identifier?: string }> {
  if (cachedVoice) return cachedVoice;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const english = voices.filter((voice) => voice.language.toLowerCase().startsWith('en'));
    const british =
      english.find((voice) => /gb|uk/i.test(voice.language)) ??
      english.find((voice) => /gb|uk|british/i.test(voice.name)) ??
      english[0];
    cachedVoice = british
      ? { language: british.language, identifier: british.identifier }
      : { language: 'en' };
  } catch {
    cachedVoice = { language: 'en' };
  }
  return cachedVoice;
}

function speakOnDeviceNow(text: string, gen: number): void {
  void (async () => {
    const voice = await pickDeviceVoice();
    if (gen !== tapGen || !allowDevice) return;
    try {
      await enterPlaybackModeAsync();
    } catch {
      /* still try to speak */
    }
    if (gen !== tapGen || !allowDevice) return;
    Speech.speak(text, {
      language: voice.language,
      voice: voice.identifier,
      rate: 0.96,
      pitch: 1.05,
      onError: (err) => {
        log.warn('voice', 'device TTS failed', { message: String(err) });
        if (gen !== tapGen) return;
        Speech.speak(text, { language: 'en' });
      },
    });
  })();
}

/** Cut the current line and start a new one. Safe to call from a press handler. */
export function speakTapLine(text: string): void {
  const line = text.trim();
  if (!line) return;

  const gen = ++tapGen;
  allowDevice = true;
  stopReplyAudio();
  log.info('voice', 'tap line', { gen, chars: line.length });

  // Audible this frame — do not wait on the network.
  speakOnDeviceNow(line, gen);

  void (async () => {
    try {
      const spoken = await api('/voice/speak', {
        method: 'POST',
        body: JSON.stringify({ text: line }),
        schema: SpeakResponseSchema,
      });
      if (gen !== tapGen) return;
      if (!spoken.audioBase64) {
        log.warn('voice', 'tap speak returned no audio, keeping device voice');
        return;
      }
      allowDevice = false;
      Speech.stop();
      await playReply({
        audioBase64: spoken.audioBase64,
        audioMime: spoken.audioMime,
        text: spoken.reply,
      });
    } catch (err) {
      log.warn('voice', 'tap speak request failed, keeping device voice', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  })();
}
