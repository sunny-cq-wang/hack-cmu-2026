/**
 * Rive is gated behind this flag because `assets/rive/pet.riv` must be authored
 * in the Rive editor (a GUI) and cannot be generated from code.
 *
 * Until the file exists, `PetAvatar` runs the layered fallback from
 * INTEGRATIONS §4: crossfading Imagine images with a JS confetti overlay.
 *
 * TO ENABLE:
 *   1. Build `pet.riv` per P4 task file §4 (artboard `Pet`, state machine `PetSM`,
 *      inputs `happiness` Number / `celebrate` Trigger / `talking` Boolean,
 *      referenced image asset `petImage`).
 *   2. Drop it at `apps/mobile/assets/rive/pet.riv`.
 *   3. Flip HAS_RIVE_ASSET to true and rebuild the dev build (not Expo Go).
 */
export const HAS_RIVE_ASSET = false;

export const RIVE_RESOURCE_NAME = 'pet';
export const RIVE_ARTBOARD = 'Pet';
export const RIVE_STATE_MACHINE = 'PetSM';
export const RIVE_IMAGE_ASSET = 'petImage';

export const RIVE_INPUTS = {
  happiness: 'happiness',
  celebrate: 'celebrate',
  talking: 'talking',
} as const;
