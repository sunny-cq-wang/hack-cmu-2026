/**
 * Plays the Imagine celebration clip over the avatar, then auto-dismisses.
 * Optional by design: `celebrationVideoUrl` is often null and the confetti or
 * Rive celebration stands alone.
 */
import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { mediaUrl } from '../../lib/api';

const AUTO_DISMISS_MS = 5500;

interface CelebrationVideoProps {
  url: string;
  onDone: () => void;
}

export function CelebrationVideo({ url, onDone }: CelebrationVideoProps): React.JSX.Element {
  const player = useVideoPlayer(mediaUrl(url), (instance) => {
    instance.loop = false;
    instance.muted = true;
    instance.play();
  });

  // Dismiss on a timer rather than a status listener: a stalled clip must not
  // leave the overlay stuck on top of the dashboard.
  useEffect(() => {
    const timer = setTimeout(onDone, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={onDone}>
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        contentFit="contain"
        nativeControls={false}
      />
    </Pressable>
  );
}
