/**
 * The pet on the Home dashboard.
 *
 * Mood comes from `/me/today` — this component never decides it (AGENTS.md §8).
 * Ships as the layered fallback (INTEGRATIONS §4): the Imagine mood images
 * crossfade underneath and `usePetMotion` animates the body from the same three
 * `PetSM` inputs the Rive state machine takes. Once `assets/rive/pet.riv` exists,
 * flipping HAS_RIVE_ASSET hands those inputs to the transparent Rive overlay
 * instead and the JS motion parks itself (see riveConfig.ts).
 *
 * On top of that loop it is *interactive*: `usePetMotion` fires unprompted idle
 * micro-behaviours on its own, and tapping the pet plays a reaction, a haptic tick,
 * and a short line of encouragement drawn from `petPersonality.ts`.
 */
import * as Haptics from 'expo-haptics';
import { Cat, Dog, PawPrint } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { AvatarState } from '../../lib/shared';
import { useToday } from '../../lib/queries';
import { speakTapLine } from '../voice/tapVoice';
import { CelebrationVideo } from './CelebrationVideo';
import { ConfettiOverlay } from './ConfettiOverlay';
import { PetRive, type PetRiveHandle } from './PetRive';
import { PetSpeechBubble } from './PetSpeechBubble';
import { HAS_RIVE_ASSET } from './riveConfig';
import { happinessFor, imageUrlForMood } from './lib';
import { usePetMotion } from './petMotion';
import { petSpeech, SPEECH_VISIBLE_MS } from './petPersonality';
import { useAvatarTalking } from './talkingStore';
import { authHeadersSync } from './authHeadersSync';

const MOOD_FADE_MS = 400;
const HAPPINESS_MS = 600;

/** Slack after the bubble starts fading, so it is unmounted only once it is gone. */
const SPEECH_TEARDOWN_MS = 320;
/** Ignore a second tap inside this window so mashing does not stutter the pop. */
const TAP_COOLDOWN_MS = 160;

function SpeciesPlaceholder({
  species,
  size,
}: {
  species: string | null;
  size: number;
}): React.JSX.Element {
  const Icon = species === 'cat' ? Cat : species === 'dog' ? Dog : PawPrint;
  const label = species === 'cat' ? 'Cat' : species === 'dog' ? 'Dog' : species === 'virtual' ? 'Virtual' : 'Pet';
  return (
    <View style={[styles.placeholder, { width: size, height: size }]} accessibilityLabel={`${label} placeholder`}>
      <Icon size={Math.round(size * 0.36)} color="#98A1B3" strokeWidth={1.6} />
      <Text style={styles.placeholderLabel}>{label}</Text>
    </View>
  );
}

interface Speech {
  /** Bumped on every tap so the bubble remounts and replays its entrance. */
  id: number;
  text: string;
}

export function PetAvatar({ size = 220 }: { size?: number }): React.JSX.Element {
  const { data: today, isLoading } = useToday();
  const talking = useAvatarTalking();
  const riveRef = useRef<PetRiveHandle>(null);

  const mood: AvatarState = today?.mood ?? 'okay';
  const avatar = today?.avatar ?? null;
  const status = avatar?.status;

  const imageUrl = imageUrlForMood(avatar, mood);
  // Same Imagine run → same three URLs. A new photo (or a cleared avatar) changes
  // this key, and we must not keep the previous bitmap underneath the cutout.
  const generation = `${avatar?.neutralUrl ?? ''}|${avatar?.thrivingUrl ?? ''}|${avatar?.droopingUrl ?? ''}|${avatar?.status ?? 'none'}`;

  // Two stacked layers so a *mood* change crossfades instead of popping.
  const [frontUrl, setFrontUrl] = useState<string | null>(imageUrl);
  const [backUrl, setBackUrl] = useState<string | null>(null);
  const fade = useSharedValue(1);
  const generationRef = useRef(generation);

  const clearBack = useCallback(() => setBackUrl(null), []);

  useEffect(() => {
    if (imageUrl === frontUrl) return;
    const generationChanged = generation !== generationRef.current;
    generationRef.current = generation;
    // New photo, cleared avatar, or first paint: swap in place. Leaving the old
    // frame as a back-layer shows through sticker cutouts.
    if (generationChanged || !imageUrl || !frontUrl) {
      setBackUrl(null);
      setFrontUrl(imageUrl);
      fade.value = 1;
      return;
    }
    setBackUrl(frontUrl);
    setFrontUrl(imageUrl);
    fade.value = 0;
    fade.value = withTiming(1, { duration: MOOD_FADE_MS, easing: Easing.inOut(Easing.quad) }, (finished) => {
      if (finished) runOnJS(clearBack)();
    });
  }, [imageUrl, frontUrl, generation, fade, clearBack]);

  // Animate happiness and push each frame into Rive when it is enabled.
  const happiness = useSharedValue(happinessFor(mood));
  useEffect(() => {
    happiness.value = withTiming(happinessFor(mood), {
      duration: HAPPINESS_MS,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [mood, happiness]);

  const pushHappiness = useCallback((value: number) => {
    riveRef.current?.setHappiness(value);
  }, []);

  useAnimatedReaction(
    () => happiness.value,
    (value) => {
      if (HAS_RIVE_ASSET) runOnJS(pushHappiness)(value);
    },
    [pushHappiness],
  );

  // The JS state machine. Parked while Rive owns the motion, so the two can never
  // animate the same body at once.
  const motion = usePetMotion(happiness, talking, size, !HAS_RIVE_ASSET);

  useEffect(() => {
    if (HAS_RIVE_ASSET) riveRef.current?.setTalking(talking);
  }, [talking]);

  // Celebrate exactly once per streak flip (false → true).
  const lastCounted = useRef<boolean | null>(null);
  const [confettiRun, setConfettiRun] = useState(0);
  const [showVideo, setShowVideo] = useState(false);

  useEffect(() => {
    if (!today) return;
    const counted = today.streak.todayCounted;
    const flipped = lastCounted.current === false && counted;
    lastCounted.current = counted;
    if (!flipped) return;

    setConfettiRun((run) => run + 1);
    riveRef.current?.celebrate();
    motion.celebrate();
    if (today.avatar?.celebrationVideoUrl) setShowVideo(true);
  }, [today, motion]);

  // ---------- tap to interact ----------

  const [speech, setSpeech] = useState<Speech | null>(null);
  const [speechVisible, setSpeechVisible] = useState(false);
  const speechIndex = useRef(0);
  const lastTapAt = useRef(0);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const clearTimers = useCallback(() => {
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  // The voice sheet owns the pet's mouth. A tap-started line already has a
  // bubble on screen — keep it. Only hide when talk starts with no bubble
  // (push-to-talk).
  useEffect(() => {
    if (!talking || speech) return;
    clearTimers();
    setSpeechVisible(false);
    setSpeech(null);
  }, [talking, speech, clearTimers]);

  const handlePress = useCallback(() => {
    const now = Date.now();
    if (now - lastTapAt.current < TAP_COOLDOWN_MS) return;
    lastTapAt.current = now;

    // A no-op while Rive owns the motion or reduce-motion is on — the bubble and
    // the haptic tick still land, so the tap never feels dead.
    motion.react();

    // Fire-and-forget: a device with no haptic motor must never break the tap.
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);

    const text = petSpeech(mood, today?.combined ?? 0, speechIndex.current, today?.pet?.species);
    speechIndex.current += 1;

    clearTimers();
    setSpeech({ id: now, text });
    setSpeechVisible(true);
    timers.current.push(
      setTimeout(() => setSpeechVisible(false), SPEECH_VISIBLE_MS),
      setTimeout(() => setSpeech(null), SPEECH_VISIBLE_MS + SPEECH_TEARDOWN_MS),
    );
    speakTapLine(text);
  }, [motion, mood, today?.combined, today?.pet?.species, clearTimers]);

  const frontStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const species = today?.pet?.species ?? null;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Animated.View
        style={[styles.shadow, { width: size * 0.46, bottom: size * 0.06 }, motion.shadowStyle]}
        pointerEvents="none"
      />

      <Animated.View style={[styles.layer, { width: size, height: size }, motion.bodyStyle]}>
        {backUrl ? (
          <Image
            source={{ uri: backUrl, headers: authHeadersSync() }}
            style={[styles.layer, { width: size, height: size }]}
            resizeMode="contain"
          />
        ) : null}
        {frontUrl ? (
          <Animated.Image
            source={{ uri: frontUrl, headers: authHeadersSync() }}
            style={[styles.layer, { width: size, height: size }, frontStyle]}
            resizeMode="contain"
          />
        ) : (
          <SpeciesPlaceholder species={species} size={size} />
        )}
      </Animated.View>

      {HAS_RIVE_ASSET && <PetRive ref={riveRef} size={size} talking={talking} />}
      {!HAS_RIVE_ASSET && <ConfettiOverlay size={size} runId={confettiRun} />}

      {/* Sits above the body and the Rive overlay so the whole pet is tappable. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel="Pet your pet"
        accessibilityHint="Plays a reaction and a short spoken message"
      />

      {isLoading && (
        <View style={styles.badge}>
          <ActivityIndicator size="small" />
        </View>
      )}
      {status === 'generating' && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Drawing…</Text>
        </View>
      )}
      {talking && (
        <View style={[styles.badge, styles.badgeTalking]}>
          <Text style={styles.badgeText}>talking</Text>
        </View>
      )}

      {speech && (
        <PetSpeechBubble
          key={speech.id}
          text={speech.text}
          size={size}
          animate={motion.isAnimating}
          visible={speechVisible}
        />
      )}

      {showVideo && today?.avatar?.celebrationVideoUrl && (
        <CelebrationVideo url={today.avatar.celebrationVideoUrl} onDone={() => setShowVideo(false)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  layer: {
    position: 'absolute',
  },
  /** Contact shadow the body hops off; `usePetMotion` scales and fades it. */
  shadow: {
    position: 'absolute',
    alignSelf: 'center',
    height: 10,
    borderRadius: 999,
    backgroundColor: '#000',
  },
  badge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  badgeTalking: {
    bottom: 4,
    left: 4,
    right: undefined,
    backgroundColor: 'rgba(90,169,230,0.9)',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1A1D24',
    borderRadius: 999,
  },
  placeholderLabel: {
    color: '#98A1B3',
    fontSize: 15,
    fontWeight: '700',
  },
});
