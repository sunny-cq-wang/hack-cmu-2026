/** Meal-slot presentation helpers. Shared by the Log sheet and the Plan cards. */
import { MealSlotSchema, type Meal } from '@petplate/shared';

import type { SegmentedOption } from '../../components/ui';

export type MealSlot = Meal['slot'];

const LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export function slotLabel(slot: MealSlot): string {
  return LABELS[slot];
}

export const SLOT_OPTIONS: SegmentedOption<MealSlot>[] = MealSlotSchema.options.map((slot) => ({
  label: LABELS[slot],
  value: slot,
}));

/**
 * Which slot to pre-select. Purely a UI default — the user can override it and the
 * server stores whatever is sent.
 */
export function slotForHour(hour: number): MealSlot {
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}
