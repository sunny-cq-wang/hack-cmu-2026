/**
 * The palette from `tasks/P1_MOBILE_CORE.md` §5. Anything tinted by the pet's mood
 * must read its colour from `stateColor()` so the three states stay identical
 * everywhere they appear.
 */
import { AvatarStateSchema, type AvatarState } from '@petplate/shared';
import type { TextStyle } from 'react-native';

export const colors = {
  bg: '#0F1115',
  card: '#1A1D24',
  cardRaised: '#222630',
  border: '#2B303B',
  text: '#F2F4F8',
  textMuted: '#98A1B3',
  textFaint: '#68718A',

  thriving: '#3DDC97',
  okay: '#FFC857',
  drooping: '#FF6B6B',

  overlay: 'rgba(8, 10, 14, 0.72)',
  transparent: 'transparent',
} as const;

const STATE_COLORS: Record<AvatarState, string> = {
  thriving: colors.thriving,
  okay: colors.okay,
  drooping: colors.drooping,
};

/** The one place a state string becomes a colour. */
export function stateColor(state: AvatarState | null | undefined): string {
  if (!state) {
    return colors.textMuted;
  }
  const parsed = AvatarStateSchema.safeParse(state);
  return parsed.success ? STATE_COLORS[parsed.data] : colors.textMuted;
}

/** Accent for the app itself, separate from mood so the two never get confused. */
export const accent = colors.thriving;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 32, fontWeight: '700', color: colors.text } satisfies TextStyle,
  title: { fontSize: 24, fontWeight: '700', color: colors.text } satisfies TextStyle,
  heading: { fontSize: 18, fontWeight: '600', color: colors.text } satisfies TextStyle,
  body: { fontSize: 15, fontWeight: '400', color: colors.text } satisfies TextStyle,
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted } satisfies TextStyle,
  caption: { fontSize: 12, fontWeight: '400', color: colors.textFaint } satisfies TextStyle,
};

export const theme = { colors, spacing, radius, typography, accent, stateColor } as const;
export type Theme = typeof theme;
