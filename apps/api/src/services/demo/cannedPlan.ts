import { MealPlanProposalSchema, type MealPlanProposal } from '@petplate/shared';

export const CANNED_MEAL_PLAN: MealPlanProposal = MealPlanProposalSchema.parse({
  meals: [
    {
      slot: 'breakfast',
      title: 'Oatmeal with berries and yogurt',
      ingredientLines: [
        { name: 'Oats, cooked', grams: 200, usdaQuery: 'oats cooked' },
        { name: 'Blueberries', grams: 80, usdaQuery: 'blueberries raw' },
        { name: 'Greek yogurt', grams: 150, usdaQuery: 'yogurt greek' },
      ],
    },
    {
      slot: 'lunch',
      title: 'Chicken, rice, and broccoli',
      ingredientLines: [
        { name: 'Grilled chicken breast', grams: 150, usdaQuery: 'chicken breast grilled' },
        { name: 'Brown rice, cooked', grams: 180, usdaQuery: 'rice brown cooked' },
        { name: 'Broccoli, steamed', grams: 120, usdaQuery: 'broccoli cooked boiled' },
      ],
    },
    {
      slot: 'dinner',
      title: 'Lentil and salmon bowl',
      ingredientLines: [
        { name: 'Lentils, cooked', grams: 200, usdaQuery: 'lentils cooked' },
        { name: 'Salmon, baked', grams: 120, usdaQuery: 'salmon cooked' },
        { name: 'Spinach, cooked', grams: 100, usdaQuery: 'spinach cooked' },
        { name: 'Olive oil', grams: 10, usdaQuery: 'oil olive' },
      ],
    },
  ],
});
