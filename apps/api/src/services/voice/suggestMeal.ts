/**
 * Single-meal suggestion used by the `suggest_meal` voice tool.
 *
 * TODO(P2): this is the one-meal variant of `services/mealplan/generate.ts`, and
 * it does NOT enrich through USDA because `services/usda/fdc.ts` does not exist
 * yet. `kcal` is therefore Grok's own estimate. Once P2 lands, route the
 * ingredient lines through USDA and replace `kcal` with the computed total.
 */
import { z } from 'zod';
import { config } from '../../config.js';
import { log } from '../../lib/log.js';
import { chatAvailable, grokChat } from './chatClient.js';

export const MIN_SUGGESTION_KCAL = 300;

const SuggestionSchema = z.object({
  title: z.string().min(1),
  kcal: z.number().positive(),
  ingredientLines: z
    .array(z.object({ name: z.string().min(1), grams: z.number().positive(), usdaQuery: z.string().default('') }))
    .min(1),
});
export type MealSuggestion = z.infer<typeof SuggestionSchema>;

export interface SuggestMealInput {
  kcalRemaining: number;
  topGaps: { label: string; pct: number }[];
  constraint?: string;
}

/** Deterministic fallback so the voice turn always has something to read back. */
export function fallbackSuggestion(input: SuggestMealInput): MealSuggestion {
  const kcal = Math.max(MIN_SUGGESTION_KCAL, Math.round(input.kcalRemaining));
  const gap = input.topGaps[0]?.label.toLowerCase() ?? 'fiber';
  return {
    title: `Lentil bowl with brown rice and spinach (${gap}-focused)`,
    kcal,
    ingredientLines: [
      { name: 'cooked lentils', grams: 200, usdaQuery: 'lentils cooked' },
      { name: 'cooked brown rice', grams: 150, usdaQuery: 'rice brown cooked' },
      { name: 'spinach', grams: 80, usdaQuery: 'spinach raw' },
    ],
  };
}

export async function suggestMeal(input: SuggestMealInput): Promise<MealSuggestion> {
  const targetKcal = Math.max(MIN_SUGGESTION_KCAL, Math.round(input.kcalRemaining));
  if (!chatAvailable()) return fallbackSuggestion(input);

  const gapText = input.topGaps.length
    ? input.topGaps.map((g) => `${g.label} at ${g.pct}% of target`).join(', ')
    : 'no specific gaps';
  const constraint = input.constraint?.trim() ? ` The user asked for: ${input.constraint.trim()}.` : '';

  const startedAt = Date.now();
  try {
    const completion = await grokChat().chat.completions.create({
      model: config.GROK_CHAT_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You plan a single meal. Respond with JSON only: { "title": string, "kcal": number, "ingredientLines": [{ "name": string, "grams": number, "usdaQuery": string }] }. ' +
            'usdaQuery is 2-4 words matching a USDA FoodData Central entry. Use 2-5 ingredients with realistic edible-portion grams.',
        },
        {
          role: 'user',
          content: `Plan one meal of roughly ${targetKcal} kcal that helps with these nutrient gaps: ${gapText}.${constraint}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    const parsed = SuggestionSchema.parse(JSON.parse(raw));
    log.info({ ext: 'grok.suggestMeal', ms: Date.now() - startedAt, ok: true, kcal: parsed.kcal }, 'suggestMeal ok');
    return parsed;
  } catch (err) {
    log.warn(
      { ext: 'grok.suggestMeal', ms: Date.now() - startedAt, ok: false, err: (err as Error).message },
      'suggestMeal failed — using fallback',
    );
    return fallbackSuggestion(input);
  }
}
