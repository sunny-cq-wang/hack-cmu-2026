/**
 * "New photo" — the post-onboarding way back into the avatar pipeline.
 *
 * Deliberately thin: every piece of behaviour (picker, style chips, polling, the
 * three mood tiles, the single `['today']` invalidation once status flips to
 * `ready`) lives in `AvatarGenerator`, which this only mounts in `regenerate` mode
 * inside the shared bottom `Sheet`.
 */
import { useCallback } from 'react';

import { Sheet } from '../../components/ui';
import { useToday } from '../../lib/queries';
import { AvatarGenerator } from './AvatarGenerator';

export interface RegenerateAvatarSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function RegenerateAvatarSheet({ visible, onClose }: RegenerateAvatarSheetProps): React.JSX.Element {
  // Remounts the generator on every open, so a sheet closed mid-run reopens on the
  // picker rather than on a stale "ready" from last time.
  const handleDone = useCallback(() => onClose(), [onClose]);
  // An invented pet has no photo to replace — the redraw runs off its description —
  // so the title would be promising a picker that never appears.
  const { data: today } = useToday();
  const title = today?.pet?.species === 'virtual' ? 'Redraw avatar' : 'New photo';

  return (
    <Sheet visible={visible} onClose={onClose} title={title} maxHeightRatio={0.88}>
      {visible && <AvatarGenerator mode="regenerate" onReady={handleDone} onCancel={handleDone} />}
    </Sheet>
  );
}
