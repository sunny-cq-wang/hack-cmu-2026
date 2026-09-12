import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const colors = {
  bg: '#0F1115',
  card: '#1A1D24',
  text: '#F2F4F8',
  muted: '#9AA3B2',
  thriving: '#3DDC97',
  okay: '#FFC857',
  drooping: '#FF6B6B',
  accent: '#6EA8FE',
  /** Second series colour, so the human weight chart reads apart from the pet's. */
  accentAlt: '#B79CFF',
};

/** Home/Log/Plan wrap in SafeAreaView; this tab does not, so pad past the status bar. */
export function usePetPagePad(): { paddingTop: number } {
  const insets = useSafeAreaInsets();
  return { paddingTop: insets.top + 12 };
}
