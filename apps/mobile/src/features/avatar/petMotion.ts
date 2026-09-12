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
 *   idle     unprompted micro-behaviours — head tilt, double-hop + tail wag,
 *            look-around lean, shiver — fired at randomized intervals whose spacing
 *            and mix both track `happiness` (see `petPersonality.ts`).
 *   talk     ear/mouth wiggle while TTS is speaking.
 *   effects  a `celebrate` pop and a smaller `react` pop for taps, paired with
 *            `ConfettiOverlay`.
 *
 * Everything above rides the one free-running clock and a handful of shared values,
 * so the whole thing stays on the UI thread: the only JS-thread work is a single
 * `setTimeout` that decides which behaviour to fire next.
 */
import { useCallback, useEffect, useRef } from 'react';
import {
  Easing,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { nextIdleDelayMs, pickIdleBehaviour, type IdleBehaviour } from './petPersonality';

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

// ---------- idle micro-behaviours ----------

/** Head tilt: `tilt` is a signed −1…1, so the same value drives both directions. */
const TILT_DEG = 8;
const TILT_IN_MS = 300;
const TILT_HOLD_MS = 620;
const TILT_OUT_MS = 440;

/** Look-around lean: shifts sideways and leans into the direction it is looking. */
const LEAN_PX = 9;
const LEAN_DEG = 2.5;

/** The extra lift of a deliberate double-hop, on top of the ambient hop. */
const IDLE_HOP_PX = 16;

/** Tail wag, read as a fast sway of the whole body — dogs wag with their hips. */
const WAG_HZ = 5.5;
const WAG_PX = 3.5;
const WAG_DEG = 1.4;

/** Shiver: faster and tighter than the wag, and it never rotates. */
const SHIVER_HZ = 13;
const SHIVER_PX = 1.8;

/** Tap reaction — the same shape as `celebrate`, roughly half the size. */
const POKE_UP_MS = 110;
const POKE_DOWN_MS = 540;
const POKE_LIFT_PX = 14;
const POKE_SCALE = 0.07;
const POKE_DEG = 3.5;

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
  /** Fires the smaller "you tapped me" pop + wag. Safe to call from JS. */
  react: () => void;
  /** True while the JS motion layer is actually running (not parked). */
  isAnimating: boolean;
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

  // Idle layer. Each is 0 at rest, so a parked pet costs nothing in the worklet.
  const tilt = useSharedValue(0);
  const lean = useSharedValue(0);
  const bounce = useSharedValue(0);
  const wag = useSharedValue(0);
  const shiver = useSharedValue(0);
  const poke = useSharedValue(0);

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

  const react = useCallback(() => {
    if (!animating) return;
    poke.value = withSequence(
      withTiming(1, { duration: POKE_UP_MS, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: POKE_DOWN_MS, easing: Easing.elastic(2) }),
    );
    bounce.value = withSequence(
      withTiming(0.9, { duration: 150, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 230, easing: Easing.in(Easing.quad) }),
    );
    wag.value = withSequence(
      withTiming(1, { duration: 120 }),
      withDelay(620, withTiming(0, { duration: 260 })),
    );
  }, [animating, poke, bounce, wag]);

  /**
   * Runs one micro-behaviour. Every branch only assigns to shared values, so the
   * animation itself is handed straight to the UI thread and this function returns
   * immediately — no per-frame JS work and no re-render.
   */
  const runIdle = useCallback(
    (behaviour: IdleBehaviour, direction: 1 | -1) => {
      switch (behaviour) {
        case 'headTilt':
          tilt.value = withSequence(
            withTiming(direction, { duration: TILT_IN_MS, easing: Easing.out(Easing.quad) }),
            withDelay(
              TILT_HOLD_MS,
              withTiming(0, { duration: TILT_OUT_MS, easing: Easing.inOut(Easing.quad) }),
            ),
          );
          return;

        case 'doubleHop':
          bounce.value = withSequence(
            withTiming(1, { duration: 150, easing: Easing.out(Easing.quad) }),
            withTiming(0, { duration: 170, easing: Easing.in(Easing.quad) }),
            withTiming(0.78, { duration: 140, easing: Easing.out(Easing.quad) }),
            withTiming(0, { duration: 190, easing: Easing.in(Easing.quad) }),
          );
          wag.value = withSequence(
            withTiming(1, { duration: 170 }),
            withDelay(760, withTiming(0, { duration: 300 })),
          );
          return;

        case 'lookAround':
          lean.value = withSequence(
            withTiming(direction, { duration: 420, easing: Easing.inOut(Easing.quad) }),
            withDelay(
              360,
              withTiming(-direction * 0.85, { duration: 560, easing: Easing.inOut(Easing.quad) }),
            ),
            withDelay(320, withTiming(0, { duration: 440, easing: Easing.inOut(Easing.quad) })),
          );
          return;

        case 'shiver':
          shiver.value = withSequence(
            withTiming(1, { duration: 130 }),
            withDelay(560, withTiming(0, { duration: 280 })),
          );
          return;
      }
    },
    [tilt, lean, bounce, wag, shiver],
  );

  // Keep the latest `runIdle` reachable from the scheduler without restarting the
  // timer chain every render.
  const runIdleRef = useRef(runIdle);
  runIdleRef.current = runIdle;

  /**
   * The idle scheduler. One `setTimeout` at a time — it re-arms itself after each
   * behaviour, re-reading `happiness` so the spacing follows the mood as it eases.
   * Parked while Rive owns the motion, while reduce-motion is on, and while the pet
   * is talking (the talk wiggle owns the body then).
   */
  useEffect(() => {
    if (!animating || talking) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const arm = (): void => {
      // Reading a shared value from JS is a plain synchronous read — no bridge hop.
      const h = clamp01(happiness.value / 100);
      timer = setTimeout(() => {
        if (cancelled) return;
        const current = clamp01(happiness.value / 100);
        const direction: 1 | -1 = Math.random() < 0.5 ? -1 : 1;
        runIdleRef.current(pickIdleBehaviour(current, Math.random()), direction);
        arm();
      }, nextIdleDelayMs(h, Math.random()));
    };

    arm();

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [animating, talking, happiness]);

  // Park every idle layer the moment motion is disabled, so nothing is left tilted.
  useEffect(() => {
    if (animating) return;
    tilt.value = 0;
    lean.value = 0;
    bounce.value = 0;
    wag.value = 0;
    shiver.value = 0;
    poke.value = 0;
  }, [animating, tilt, lean, bounce, wag, shiver, poke]);

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
    const k = poke.value;

    // Idle layer: three independent oscillators off the same clock, each gated by
    // an amplitude the scheduler ramps in and out.
    const wagPhase = Math.sin(clock.value * TAU * WAG_HZ);
    const wagX = wag.value * wagPhase * WAG_PX * scale;
    const shiverX = shiver.value * Math.sin(clock.value * TAU * SHIVER_HZ) * SHIVER_PX * scale;
    const leanX = lean.value * LEAN_PX * scale;

    const idleDeg = tilt.value * TILT_DEG + lean.value * LEAN_DEG + wag.value * wagPhase * WAG_DEG;
    const idleLift = -bounce.value * IDLE_HOP_PX * scale;

    return {
      transform: [
        { translateX: leanX + wagX + shiverX },
        { translateY: hop + slump + idleLift - p * POP_LIFT_PX * scale - k * POKE_LIFT_PX * scale },
        { scaleX: (1 - pinch) * (1 + p * POP_SCALE) * (1 + k * POKE_SCALE) },
        { scaleY: (1 + pinch) * (1 + p * POP_SCALE) * (1 + k * POKE_SCALE) },
        {
          rotateZ: `${(1 - h) * SLUMP_DEG + wiggle + idleDeg + p * POP_DEG + k * POKE_DEG}deg`,
        },
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
    const k = poke.value;
    // A deliberate hop lifts the body clear of the ground too, so the shadow has to
    // answer to it as well or the pet looks pinned.
    const idleLift = clamp01(bounce.value);

    // The higher the pet, the smaller and fainter its contact shadow.
    return {
      opacity: (0.28 - 0.16 * lift - 0.08 * idleLift) * (1 - 0.5 * p) * (1 - 0.28 * k),
      transform: [{ scaleX: 1 - 0.25 * lift - 0.12 * idleLift - 0.2 * p - 0.1 * k }],
    };
  }, [animating]);

  return { bodyStyle, shadowStyle, celebrate, react, isAnimating: animating };
}
