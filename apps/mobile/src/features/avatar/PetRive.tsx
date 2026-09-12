/**
 * Rive overlay. Only mounted when HAS_RIVE_ASSET is true — see riveConfig.ts.
 *
 * Owns nothing about mood logic: the parent pushes `happiness`, `talking` and
 * the `celebrate` trigger in. The avatar never decides its own mood (AGENTS.md §8).
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Rive, { type RiveRef } from 'rive-react-native';
import {
  RIVE_ARTBOARD,
  RIVE_INPUTS,
  RIVE_RESOURCE_NAME,
  RIVE_STATE_MACHINE,
} from './riveConfig';

export interface PetRiveHandle {
  setHappiness: (value: number) => void;
  setTalking: (value: boolean) => void;
  celebrate: () => void;
}

interface PetRiveProps {
  size: number;
  talking: boolean;
}

export const PetRive = forwardRef<PetRiveHandle, PetRiveProps>(function PetRive({ size, talking }, ref) {
  const riveRef = useRef<RiveRef>(null);

  useImperativeHandle(ref, () => ({
    setHappiness(value: number) {
      try {
        riveRef.current?.setInputState(RIVE_STATE_MACHINE, RIVE_INPUTS.happiness, value);
      } catch {
        // A missing input must never crash the dashboard.
      }
    },
    setTalking(value: boolean) {
      try {
        riveRef.current?.setInputState(RIVE_STATE_MACHINE, RIVE_INPUTS.talking, value);
      } catch {
        /* ignored */
      }
    },
    celebrate() {
      try {
        riveRef.current?.fireState(RIVE_STATE_MACHINE, RIVE_INPUTS.celebrate);
      } catch {
        /* ignored */
      }
    },
  }));

  useEffect(() => {
    try {
      riveRef.current?.setInputState(RIVE_STATE_MACHINE, RIVE_INPUTS.talking, talking);
    } catch {
      /* ignored */
    }
  }, [talking]);

  return (
    <View style={[styles.container, { width: size, height: size }]} pointerEvents="none">
      <Rive
        ref={riveRef}
        resourceName={RIVE_RESOURCE_NAME}
        artboardName={RIVE_ARTBOARD}
        stateMachineName={RIVE_STATE_MACHINE}
        autoplay
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
});
