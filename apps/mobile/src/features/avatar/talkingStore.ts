/**
 * Tiny external store so `VoiceSheet` can drive the avatar's `talking` state
 * without a provider or a dependency on zustand (P4 task file §5).
 */
import { useSyncExternalStore } from 'react';

let talking = false;
const listeners = new Set<() => void>();

export const avatarTalking = {
  set(value: boolean): void {
    if (talking === value) return;
    talking = value;
    for (const listener of listeners) listener();
  },
  get(): boolean {
    return talking;
  },
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useAvatarTalking = (): boolean =>
  useSyncExternalStore(subscribe, avatarTalking.get, avatarTalking.get);
