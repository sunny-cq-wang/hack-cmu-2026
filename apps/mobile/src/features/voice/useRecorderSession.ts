/**
 * Push-to-talk recording lifecycle as a serialized state machine.
 *
 * why: expo-audio's Android recorder throws `AudioRecorderAlreadyPreparedException`
 * ("AudioRecorder has already been prepared…") from `prepareRecording` whenever
 * `recorder != null || isPrepared || isRecording || isPaused`. That surfaces in JS
 * as `call to function 'audioRecord.prepareToRecordAsync' has been rejected`.
 * A naive `onPressIn`/`onPressOut` pair can therefore wedge the recorder: the
 * release handler runs while the press handler is still awaiting the permission
 * dialog, so the recording it starts a moment later has nobody left to stop it,
 * and the *next* press is rejected.
 *
 * Every native call here goes through one promise queue, so:
 *   - two `prepareToRecordAsync` calls can never overlap;
 *   - a release that lands mid-preparation is queued behind it and still stops
 *     the session it was meant to stop;
 *   - `stop()` only ever runs from the `recording` state, i.e. on a recorder we
 *     have seen prepare successfully.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  type AudioRecorder,
} from 'expo-audio';
import { enterPlaybackModeAsync, enterRecordingModeAsync } from './audioSession';

/** Hard cap on a single clip; also drives the countdown ring. */
export const MAX_RECORD_MS = 20_000;
/** Below this the encoder usually writes a header-only file — silence, not speech. */
export const MIN_RECORD_MS = 300;

const TICK_MS = 100;
const RETRY_DELAY_MS = 300;

const MESSAGES = {
  denied: 'Microphone permission is off. Enable it in Settings, or type your message instead.',
  justGranted: 'Microphone enabled — press and hold the button to talk.',
  unavailable: "The microphone didn't start. Type your message instead to keep going.",
  captureFailed: "Couldn't capture that clip. Type your message instead to keep going.",
  tooShort: 'Hold the button while you talk — that was too short to hear.',
} as const;

export type RecorderPhase = 'idle' | 'preparing' | 'recording' | 'stopping';

export interface RecordedClip {
  uri: string;
  durationMs: number;
}

export interface UseRecorderSession {
  phase: RecorderPhase;
  /** `true` while the button should look active (preparing or recording). */
  active: boolean;
  elapsedMs: number;
  /** Call from `onPressIn`. */
  press: () => void;
  /** Call from `onPressOut`; also used by the 20 s auto-stop. */
  release: () => void;
}

interface RecorderSessionOptions {
  onClip: (clip: RecordedClip) => void;
  onFailure: (message: string) => void;
}

type PermissionOutcome = 'granted' | 'just-granted' | 'denied';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureMicPermissionAsync(): Promise<PermissionOutcome> {
  const current = await getRecordingPermissionsAsync();
  if (current.granted) return 'granted';
  const requested = await requestRecordingPermissionsAsync();
  // A grant that had to be asked for means the press was spent on the system
  // dialog: the finger is long gone, so ask for a fresh press rather than
  // recording a clip nobody is holding.
  return requested.granted ? 'just-granted' : 'denied';
}

/**
 * Drop any native session the recorder is still holding.
 *
 * `getStatus()` is the recorder's own view (`canRecord` mirrors the native
 * `isPrepared`), so this is the only place allowed to call `stop()` outside the
 * `recording` state — and only when the native side says there is something to
 * stop.
 */
async function releaseNativeSessionAsync(recorder: AudioRecorder): Promise<void> {
  const status = recorder.getStatus();
  if (!status.canRecord && !status.isRecording) return;
  try {
    await recorder.stop();
  } catch {
    // Already gone — nothing left to release.
  }
}

async function prepareOnceAsync(recorder: AudioRecorder): Promise<void> {
  await enterRecordingModeAsync();
  await recorder.prepareToRecordAsync();
}

/** Prepare, and on failure clear the stale session and try exactly once more. */
async function prepareWithRetryAsync(recorder: AudioRecorder): Promise<void> {
  try {
    await prepareOnceAsync(recorder);
    return;
  } catch {
    // Fall through to the single retry below.
  }
  await releaseNativeSessionAsync(recorder);
  await delay(RETRY_DELAY_MS);
  await prepareOnceAsync(recorder);
}

export function useRecorderSession(options: RecorderSessionOptions): UseRecorderSession {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);

  const optionsRef = useRef(options);
  const phaseRef = useRef<RecorderPhase>('idle');
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  // The file the *current* session writes to, captured right after prepare:
  // `recorder.uri` keeps pointing at the previous clip once a session ends, so
  // reading it after `stop()` can resend the last turn's audio.
  const clipUriRef = useRef<string | null>(null);
  const startedAtRef = useRef(0);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    optionsRef.current = options;
  });

  const clearTimers = useCallback(() => {
    if (tickerRef.current) clearInterval(tickerRef.current);
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    tickerRef.current = null;
    autoStopRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimers();
    };
  }, [clearTimers]);

  const transition = useCallback((next: RecorderPhase) => {
    phaseRef.current = next;
    if (mountedRef.current) setPhase(next);
  }, []);

  const fail = useCallback((message: string) => {
    if (mountedRef.current) optionsRef.current.onFailure(message);
  }, []);

  const enqueue = useCallback((op: () => Promise<void>) => {
    const run = async (): Promise<void> => {
      try {
        await op();
      } catch {
        // Each op reports its own failure; the queue itself must never break.
      }
    };
    queueRef.current = queueRef.current.then(run, run);
  }, []);

  const runStop = useCallback(async (): Promise<void> => {
    // Only a session we watched prepare and start can be stopped. Anything else
    // (permission denied, prepare rejected, a duplicate release) is a no-op.
    if (phaseRef.current !== 'recording') return;

    transition('stopping');
    clearTimers();

    const durationMs = Date.now() - startedAtRef.current;
    const uri = clipUriRef.current;
    clipUriRef.current = null;
    startedAtRef.current = 0;

    let stopped = true;
    try {
      await recorder.stop();
    } catch {
      stopped = false;
    }

    if (mountedRef.current) setElapsedMs(0);
    transition('idle');

    try {
      await enterPlaybackModeAsync();
    } catch {
      // Playback keeps whatever mode the OS has; not worth failing the turn.
    }

    if (!stopped || !uri) {
      fail(MESSAGES.captureFailed);
      return;
    }
    if (durationMs < MIN_RECORD_MS) {
      fail(MESSAGES.tooShort);
      return;
    }
    if (mountedRef.current) optionsRef.current.onClip({ uri, durationMs });
  }, [clearTimers, fail, recorder, transition]);

  const runStart = useCallback(async (): Promise<void> => {
    if (phaseRef.current !== 'idle') return;
    transition('preparing');

    const permission = await ensureMicPermissionAsync();
    if (permission !== 'granted') {
      transition('idle');
      fail(permission === 'denied' ? MESSAGES.denied : MESSAGES.justGranted);
      return;
    }

    try {
      await prepareWithRetryAsync(recorder);
    } catch {
      transition('idle');
      fail(MESSAGES.unavailable);
      return;
    }

    // Native `prepare` assigns the output file, so this is the first moment the
    // uri belongs to *this* session.
    const uri = recorder.uri;
    if (!uri) {
      await releaseNativeSessionAsync(recorder);
      transition('idle');
      fail(MESSAGES.unavailable);
      return;
    }

    try {
      recorder.record();
    } catch {
      await releaseNativeSessionAsync(recorder);
      transition('idle');
      fail(MESSAGES.unavailable);
      return;
    }

    clipUriRef.current = uri;
    startedAtRef.current = Date.now();
    transition('recording');

    if (!mountedRef.current) {
      // Unmounted while preparing — close the session instead of leaking it.
      enqueue(runStop);
      return;
    }

    setElapsedMs(0);
    tickerRef.current = setInterval(() => {
      setElapsedMs(Math.min(MAX_RECORD_MS, Date.now() - startedAtRef.current));
    }, TICK_MS);
    autoStopRef.current = setTimeout(() => enqueue(runStop), MAX_RECORD_MS);
  }, [enqueue, fail, recorder, runStop, transition]);

  const press = useCallback(() => {
    enqueue(runStart);
  }, [enqueue, runStart]);

  const release = useCallback(() => {
    enqueue(runStop);
  }, [enqueue, runStop]);

  return {
    phase,
    active: phase === 'preparing' || phase === 'recording',
    elapsedMs,
    press,
    release,
  };
}
