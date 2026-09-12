/**
 * Floating push-to-talk button. Hold to record (max 20 s), release to send.
 * Opens its own `VoiceSheet` — the Home screen just renders `<TalkButton />`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { colors } from '../../components/ui';
import { CountdownRing } from './CountdownRing';
import { VoiceSheet } from './VoiceSheet';
import { useVoiceTurn } from './useVoiceTurn';

const BUTTON_SIZE = 56;
const MAX_RECORD_MS = 20_000;
const TICK_MS = 100;

export function TalkButton(): React.JSX.Element {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const turn = useVoiceTurn();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStop = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards the release handler against firing after the 20 s auto-stop.
  const stopping = useRef(false);

  const clearTimers = useCallback(() => {
    if (ticker.current) clearInterval(ticker.current);
    if (autoStop.current) clearTimeout(autoStop.current);
    ticker.current = null;
    autoStop.current = null;
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const finish = useCallback(async () => {
    if (stopping.current) return;
    stopping.current = true;
    clearTimers();
    setRecording(false);

    try {
      await recorder.stop();
    } catch {
      // Nothing was captured; fall through and let the sheet show the error.
    }
    const uri = recorder.uri;
    setElapsed(0);

    if (!uri) {
      setPermissionError("Couldn't capture audio — try the text option.");
      return;
    }
    await turn.send({ audioUri: uri });
  }, [clearTimers, recorder, turn]);

  const begin = useCallback(async () => {
    setPermissionError(null);
    turn.reset();

    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setPermissionError('Microphone permission denied');
      setSheetOpen(true);
      return;
    }

    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (err) {
      setPermissionError((err as Error).message);
      setSheetOpen(true);
      return;
    }

    stopping.current = false;
    setRecording(true);
    setSheetOpen(true);
    setElapsed(0);

    ticker.current = setInterval(() => setElapsed((ms) => ms + TICK_MS), TICK_MS);
    autoStop.current = setTimeout(() => void finish(), MAX_RECORD_MS);
  }, [finish, recorder, turn]);

  const secondsLeft = Math.max(0, Math.ceil((MAX_RECORD_MS - elapsed) / 1000));

  return (
    <>
      <View style={styles.wrap} pointerEvents="box-none">
        <Pressable
          onPressIn={() => void begin()}
          onPressOut={() => void finish()}
          style={[styles.button, recording && styles.buttonRecording]}
          accessibilityLabel="Hold to talk to your pet"
          accessibilityRole="button"
        >
          {recording && <CountdownRing size={BUTTON_SIZE} progress={elapsed / MAX_RECORD_MS} />}
          <Text style={styles.icon}>{recording ? String(secondsLeft) : '🎙'}</Text>
        </Pressable>
      </View>

      {sheetOpen && (
        <VoiceSheet
          recording={recording}
          phase={turn.phase}
          response={turn.response}
          error={permissionError ?? turn.error}
          onClose={() => {
            turn.reset();
            setSheetOpen(false);
            setPermissionError(null);
          }}
          onSendText={(text) => void turn.send({ text })}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 20,
    bottom: 28,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: colors.cardRaised,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  buttonRecording: {
    backgroundColor: colors.drooping,
  },
  icon: {
    fontSize: 20,
    color: colors.text,
    fontWeight: '700',
  },
});
