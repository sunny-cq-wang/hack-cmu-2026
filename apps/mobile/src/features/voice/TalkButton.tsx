/**
 * Floating push-to-talk button. Hold to record (max 20 s), release to send.
 * Opens its own `VoiceSheet` — the Home screen just renders `<TalkButton />`.
 *
 * The recorder lifecycle lives in `useRecorderSession`, which serializes every
 * native call; this component only renders it and routes the finished clip into
 * `useVoiceTurn`.
 */
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../components/ui';
import { CountdownRing } from './CountdownRing';
import { VoiceSheet } from './VoiceSheet';
import { useVoiceTurn } from './useVoiceTurn';
import { MAX_RECORD_MS, useRecorderSession, type RecordedClip } from './useRecorderSession';

const BUTTON_SIZE = 56;

export function TalkButton(): React.JSX.Element {
  const turn = useVoiceTurn();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const handleClip = useCallback(
    (clip: RecordedClip) => {
      void turn.send({ audioUri: clip.uri });
    },
    [turn],
  );

  const handleFailure = useCallback((message: string) => {
    setMicError(message);
    setSheetOpen(true);
  }, []);

  const mic = useRecorderSession({ onClip: handleClip, onFailure: handleFailure });

  const handlePressIn = useCallback(() => {
    setMicError(null);
    // Releases any player still holding the audio session and stops the pet
    // mid-sentence if the user interrupts.
    turn.reset();
    setSheetOpen(true);
    mic.press();
  }, [mic, turn]);

  const secondsLeft = Math.max(0, Math.ceil((MAX_RECORD_MS - mic.elapsedMs) / 1000));

  return (
    <>
      <View style={styles.wrap} pointerEvents="box-none">
        <Pressable
          onPressIn={handlePressIn}
          onPressOut={mic.release}
          style={[styles.button, mic.active && styles.buttonRecording]}
          accessibilityLabel="Hold to talk to your pet"
          accessibilityRole="button"
        >
          {mic.phase === 'recording' && (
            <CountdownRing size={BUTTON_SIZE} progress={mic.elapsedMs / MAX_RECORD_MS} />
          )}
          <Text style={styles.icon}>{mic.phase === 'recording' ? String(secondsLeft) : '🎙'}</Text>
        </Pressable>
      </View>

      {sheetOpen && (
        <VoiceSheet
          micPhase={mic.phase}
          phase={turn.phase}
          response={turn.response}
          error={micError ?? turn.error}
          onClose={() => {
            turn.reset();
            setSheetOpen(false);
            setMicError(null);
          }}
          onSendText={(text) => {
            setMicError(null);
            void turn.send({ text });
          }}
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
