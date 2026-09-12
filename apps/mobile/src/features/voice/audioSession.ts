/**
 * The two audio-session modes a voice turn moves between.
 *
 * Kept in one place because the order matters: the recorder must own the
 * session before `prepareToRecordAsync`, and the session must be handed back to
 * playback before the reply is played — otherwise iOS keeps the
 * `playAndRecord` category and the pet answers at a whisper.
 */
import { setAudioModeAsync } from 'expo-audio';

/**
 * Claim the session for recording.
 *
 * `allowsRecording` is iOS-only (see `AudioMode` in expo-audio's typings); on
 * Android the call is still required because it resets `allowsBackgroundRecording`
 * on every live recorder, which decides whether `prepareRecording` demands the
 * POST_NOTIFICATIONS permission.
 */
export async function enterRecordingModeAsync(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    shouldRouteThroughEarpiece: false,
  });
}

/** Hand the session back to playback so the reply comes out of the speaker. */
export async function enterPlaybackModeAsync(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
    shouldRouteThroughEarpiece: false,
  });
}
