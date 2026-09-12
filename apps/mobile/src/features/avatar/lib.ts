/**
 * Avatar helpers: mood → image/happiness mapping and authenticated photo fetch.
 */
import type { AvatarInfo, AvatarState, TodaySummary } from '../../lib/shared';
import { apiUrl, authHeaders } from '../../lib/api';

/** INTEGRATIONS §4: thriving → 92, okay → 65, drooping → 20. */
export const HAPPINESS_BY_MOOD: Record<AvatarState, number> = {
  thriving: 92,
  okay: 65,
  drooping: 20,
};

export const happinessFor = (mood: AvatarState): number => HAPPINESS_BY_MOOD[mood];

/**
 * Picks the image for the current mood, falling back to neutral. Returns null
 * when the avatar has not been generated, so the caller uses the bundled asset.
 */
export function imageUrlForMood(avatar: AvatarInfo | null | undefined, mood: AvatarState): string | null {
  if (!avatar) return null;
  const byMood: Record<AvatarState, string | null> = {
    thriving: avatar.thrivingUrl,
    okay: avatar.neutralUrl,
    drooping: avatar.droopingUrl,
  };
  const chosen = byMood[mood] ?? avatar.neutralUrl;
  const resolved = chosen ?? avatar.neutralUrl;
  return resolved ? apiUrl(resolved) : null;
}

/** Photo routes require auth, so RN's `<Image source={{ uri }}>` needs the header too. */
export async function photoImageSource(url: string): Promise<{ uri: string; headers: Record<string, string> }> {
  return { uri: url, headers: await authHeaders() };
}

/** Rive referenced assets need raw bytes; fetch with the auth header. */
export async function getPhotoBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { headers: await authHeaders() });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Detects the streak flipping false → true across renders. Returns true exactly
 * once per flip so the celebration cannot fire twice (P4 acceptance check).
 */
export function didStreakFlip(previous: boolean | null, today: TodaySummary | undefined): boolean {
  if (!today) return false;
  return previous === false && today.streak.todayCounted;
}
