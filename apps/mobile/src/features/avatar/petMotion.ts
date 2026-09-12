/**
 * The `PetSM` motion from `tasks/P4_AVATAR_AND_VOICE.md` §4, run on the UI thread.
 *
 * This is the motion half of the layered fallback (INTEGRATIONS §4): the Imagine
 * mood images carry the likeness, this carries the life. It takes exactly the three
 * inputs the Rive state machine takes — `happiness` (0–100), `talking`, and a
 * `celebrate` trigger — so when `assets/rive/pet.riv` lands, `PetAvatar` hands those
 * same three values to `PetRive` instead and nothing else about the screen changes.
 *
 * Layers, mirroring the state machine:
 *   body     `happiness` blends Droop (sunken, near-still) → Idle (breathing) →
 *            Bounce (a real hop), with squash-and-stretch paired to the hop.
 *   talk     ear/mouth wiggle while TTS is speaking.
 *   effects  a `celebrate` pop, paired with `ConfettiOverlay`.
 */
import { useCallback, useEffect } from 'react';
import {
  Easing,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

const TAU = Math.PI * 2;

/** The size the constants below are tuned against; everything scales from it. */
const REFERENCE_SIZE = 220;

// Hop height in px. Droop barely lifts off the ground, Bounce actually hops.
const AMP_DROOP = 1.5;
const AMP_BOUNCE = 11;

// Hops per second — a drooping pet is slow and heavy, a thriving one is quick.
const FREQ_DROOP = 0.5;
const FREQ_BOUNCE = 1.35;

/** How far the body sinks and slumps at `happiness` 0. */
const SLUMP_PX = 9;
const SLUMP_DEG = 3.5;

/** Squash/stretch depth at full happiness. */
const SQUASH = 0.06;

const TALK_HZ = 9;
const TALK_DEG = 1.6;
const TALK_RAMP_MS = 140;

const POP_UP_MS = 140;
const POP_DOWN_MS = 620;
const POP_LIFT_PX = 26;
const POP_SCALE = 0.12;
const POP_DEG = 6;

const clamp01 = (value: number): number => {
  'worklet';
  return value < 0 ? 0 : value > 1 ? 1 : value;
};

export interface PetMotion {
  /** Transform for the pet body. Apply to the wrapper around the mood images. */
  bodyStyle: ReturnType<typeof useAnimatedStyle>;
  /** Contact shadow — tightens and darkens as the body comes back down. */
  shadowStyle: ReturnType<typeof useAnimatedStyle>;
  /** Fires the one-shot celebration pop. Safe to call from JS. */
  celebrate: () => void;
}

/**
 * @param happiness 0–100, already eased by the caller (`withTiming` over 600 ms per
 *   INTEGRATIONS §4) — this hook reads it every frame and never animates it itself.
 * @param enabled   false when Rive owns the motion, so the frame loop stays parked.
 */
export function usePetMotion(
  happiness: SharedValue<number>,
  talking: boolean,
  size: number,
  enabled: boolean,
): PetMotion {
  // Respect the OS "reduce motion" switch: posture still reads the mood, but
  // nothing oscillates.
  const reducedMotion = useReducedMotion();
  const animating = enabled && !reducedMotion;

  const clock = useSharedValue(0);
  const talkAmount = useSharedValue(0);
  const pop = useSharedValue(0);

  // A free-running clock is the cheapest way to drive oscillators whose amplitude
  // and frequency both track `happiness` continuously — `withRepeat` would have to
  // be torn down and rebuilt on every mood change.
  useFrameCallback((frame) => {
    'worklet';
    clock.value += (frame.timeSincePreviousFrame ?? 16) / 1000;
  }, animating);

  useEffect(() => {
    talkAmount.value = withTiming(talking && animating ? 1 : 0, { duration: TALK_RAMP_MS });
  }, [talking, animating, talkAmount]);

  const celebrate = useCallback(() => {
    pop.value = withSequence(
      withTiming(1, { duration: POP_UP_MS, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: POP_DOWN_MS, easing: Easing.elastic(1.4) }),
    );
  }, [pop]);

  const bodyStyle = useAnimatedStyle(() => {
    const scale = size / REFERENCE_SIZE;
    const h = clamp01(happiness.value / 100);
    const slump = (1 - h) * SLUMP_PX * scale;

    if (!animating) {
      return {
        transform: [{ translateY: slump }, { rotateZ: `${(1 - h) * SLUMP_DEG}deg` }],
      };
    }

    const amp = (AMP_DROOP + (AMP_BOUNCE - AMP_DROOP) * h) * scale;
    const freq = FREQ_DROOP + (FREQ_BOUNCE - FREQ_DROOP) * h;
    const phase = clock.value * freq * TAU;

    // |sin| rests at the bottom of the arc and peaks briefly — it reads as a hop,
    // where a plain sine reads as floating.
    const hop = -Math.abs(Math.sin(phase)) * amp;
    // Widest at the bottom of the hop, tallest at the top.
    const pinch = SQUASH * h * Math.cos(phase * 2);

    const wiggle = talkAmount.value * Math.sin(clock.value * TAU * TALK_HZ) * TALK_DEG;
    const p = pop.value;

    return {
      transform: [
        { translateY: hop + slump - p * POP_LIFT_PX * scale },
        { scaleX: (1 - pinch) * (1 + p * POP_SCALE) },
        { scaleY: (1 + pinch) * (1 + p * POP_SCALE) },
        { rotateZ: `${(1 - h) * SLUMP_DEG + wiggle + p * POP_DEG}deg` },
      ],
    };
  }, [animating, size]);

  const shadowStyle = useAnimatedStyle(() => {
    const h = clamp01(happiness.value / 100);

    if (!animating) {
      return { opacity: 0.18 + 0.1 * (1 - h), transform: [{ scaleX: 1 }] };
    }

    const freq = FREQ_DROOP + (FREQ_BOUNCE - FREQ_DROOP) * h;
    const lift = Math.abs(Math.sin(clock.value * freq * TAU)) * h;
    const p = pop.value;

    // The higher the pet, the smaller and fainter its contact shadow.
    return {
      opacity: (0.28 - 0.16 * lift) * (1 - 0.5 * p),
      transform: [{ scaleX: 1 - 0.25 * lift - 0.2 * p }],
    };
  }, [animating]);

  return { bodyStyle, shadowStyle, celebrate };
}
