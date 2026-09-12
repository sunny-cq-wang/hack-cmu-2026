/**
 * Session memory for the planner instructions box. The Plan tab unmounts when you switch
 * tabs, so the draft lives in a module-level value rather than component state. It is
 * deliberately not persisted to disk: a new app launch starts from a blank field.
 */
import { useCallback, useState } from 'react';

let sessionDraft = '';

export function useInstructionsDraft(): [string, (next: string) => void] {
  const [value, setValue] = useState(sessionDraft);
  const set = useCallback((next: string) => {
    sessionDraft = next;
    setValue(next);
  }, []);
  return [value, set];
}

/** Test seam — resets the module-level draft. */
export function clearInstructionsDraft(): void {
  sessionDraft = '';
}
