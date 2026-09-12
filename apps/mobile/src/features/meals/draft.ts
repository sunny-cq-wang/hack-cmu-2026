/**
 * The editable shape behind `AnalyzeSheet`. `MealDraft` is what the server sends;
 * `DraftItem` is that plus the bookkeeping a grams stepper needs.
 */
import { MealDraftSchema, emptyNutrients, type MealDraft, type MealItem } from '@petplate/shared';

/** `@petplate/shared` is frozen and ships no alias for it, so read it off `MealItem`. */
export type MatchSource = MealItem['matchSource'];

export interface DraftItem {
  /** Stable list key — names are not unique and the user can edit grams freely. */
  key: string;
  name: string;
  grams: number;
  /** Grams the server priced `kcalAtSourceGrams` at. 0 for hand-added items. */
  sourceGrams: number;
  kcalAtSourceGrams: number;
  confidence: number;
  fdcId: number | null;
  /** Where the numbers came from. Null for hand-added items — nothing priced them yet. */
  matchSource: MatchSource | null;
}

/** Grams a hand-added item starts at (tasks/P1_MOBILE_CORE.md §4). */
export const MANUAL_ITEM_GRAMS = 100;

let keyCounter = 0;
const nextKey = (): string => {
  keyCounter += 1;
  return `draft-item-${keyCounter}`;
};

export function toDraftItems(draft: MealDraft): DraftItem[] {
  return draft.items.map((item) => ({
    key: nextKey(),
    name: item.name,
    grams: item.grams,
    sourceGrams: item.grams,
    kcalAtSourceGrams: item.nutrients.kcal,
    confidence: item.confidence,
    fdcId: item.fdcId,
    matchSource: item.matchSource,
  }));
}

export function manualItem(name: string): DraftItem {
  return {
    key: nextKey(),
    name,
    grams: MANUAL_ITEM_GRAMS,
    sourceGrams: 0,
    kcalAtSourceGrams: 0,
    confidence: 1,
    fdcId: null,
    matchSource: null,
  };
}

/**
 * What the reviewing state starts from when analysis could not produce anything —
 * the user types the meal in by hand instead.
 */
export function emptyDraft(): MealDraft {
  return MealDraftSchema.parse({
    photoId: null,
    items: [],
    totals: emptyNutrients(),
    analysis: { model: 'none', latencyMs: 0, fallback: true },
  });
}

/**
 * DISPLAY ONLY. The server re-prices every item from USDA when the meal is saved
 * (AGENTS.md §4.3); this is just so the row does not sit there showing the calories
 * of a portion size the user has already changed. Never sent anywhere.
 */
export function estimatedKcal(item: DraftItem): number | null {
  if (item.sourceGrams <= 0) {
    return null;
  }
  return Math.round((item.kcalAtSourceGrams * item.grams) / item.sourceGrams);
}
