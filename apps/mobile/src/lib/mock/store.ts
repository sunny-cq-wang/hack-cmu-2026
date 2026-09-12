// MOCK ONLY — not shipped logic; server owns all math (AGENTS.md §4.3)
//
// A mutable in-memory stand-in for the whole API. It exists so the app can be
// driven end to end before P2's server is up: logging a meal really does move
// today's totals, score, and avatar state. None of this is authoritative — when
// EXPO_PUBLIC_MOCK_API is off, not a line of it runs.
import {
  AvatarInfoSchema,
  AvatarStateSchema,
  DailyScoreSchema,
  GapsResponseSchema,
  HumanProfileSchema,
  HumanTargetsSchema,
  MealDraftSchema,
  MealPlanSchema,
  MealSchema,
  MICRO_KEYS,
  NutrientsSchema,
  PetSchema,
  TodaySummarySchema,
  UserSchema,
  type AvatarState,
  type DailyScore,
  type Feeding,
  type GapsResponse,
  type HumanProfile,
  type Meal,
  type MealCreate,
  type MealDraft,
  type MealPlan,
  type Nutrients,
  type Pet,
  type PetInput,
  type TodaySummary,
  type User,
} from '@petplate/shared';

import { nutrientsFor, sumNutrients } from './nutrition';

// ---------- helpers ----------

let sequence = 100;
const nextId = (prefix: string): string => `mock_${prefix}_${(sequence += 1)}`;

function dayKeyOf(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const todayKey = (): string => dayKeyOf(new Date());

function shiftDayKey(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dayKeyOf(date);
}

function slotForHour(hour: number): MealCreate['slot'] {
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

function scoreFor(consumed: number, target: number): number {
  if (target <= 0) return 0;
  const penalty = Math.abs(1 - consumed / target) * 100;
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

function avatarStateFor(combined: number): AvatarState {
  if (combined >= 75) return AvatarStateSchema.enum.thriving;
  if (combined >= 50) return AvatarStateSchema.enum.okay;
  return AvatarStateSchema.enum.drooping;
}

// ---------- seed ----------

const SEED_PROFILE: HumanProfile = HumanProfileSchema.parse({
  sex: 'male',
  age: 27,
  heightCm: 178,
  weightKg: 79,
  activity: 'moderate',
  goal: 'lose',
  targetWeightKg: 73,
  dietaryPrefs: ['pescatarian'],
  allergies: ['peanuts'],
});

function seedTargets(): User['targets'] {
  return HumanTargetsSchema.parse({
    kcal: 2100,
    baseKcal: 2180,
    adaptiveOffsetKcal: -80,
    proteinG: 130,
    carbsG: 236,
    fatG: 58,
    micros: { fiberG: 38, ironMg: 8, potassiumMg: 3400, vitaminCMg: 90, calciumMg: 1000 },
    computedAt: new Date().toISOString(),
    lastAdjustedAt: null,
  });
}

function seedUser(onboarded: boolean): User {
  return UserSchema.parse({
    id: 'mock_user_1',
    email: 'demo@petplate.app',
    name: 'Demo Human',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    onboardingComplete: onboarded,
    petId: onboarded ? 'mock_pet_1' : null,
    profile: onboarded ? SEED_PROFILE : null,
    targets: onboarded ? seedTargets() : null,
  });
}

function seedPet(): Pet {
  return PetSchema.parse({
    id: 'mock_pet_1',
    userId: 'mock_user_1',
    name: 'Biscuit',
    species: 'dog',
    breed: 'Beagle mix',
    sex: 'male',
    neutered: true,
    ageYears: 4,
    weightKg: 14,
    idealWeightKg: 12,
    activity: 'normal',
    food: { name: 'Blue Buffalo Adult', kcalPerCup: 377, gramsPerCup: 110 },
    mealsPerDay: 2,
    goal: 'lose',
    targets: {
      rerKcal: 344,
      merFactor: 1.6,
      baseKcal: 660,
      adaptivePct: -5,
      kcal: 627,
      portionGramsPerDay: 184,
      mealsPerDay: 2,
      computedAt: new Date().toISOString(),
      lastAdjustedAt: null,
    },
    avatar: AvatarInfoSchema.parse({
      status: 'ready',
      neutralUrl: null,
      thrivingUrl: null,
      droopingUrl: null,
      celebrationVideoUrl: null,
    }),
  });
}

function buildMeal(
  dayKey: string,
  slot: NonNullable<MealCreate['slot']>,
  loggedAt: string,
  lines: { name: string; grams: number }[],
): Meal {
  const items = lines.map((line) => ({
    name: line.name,
    grams: line.grams,
    nutrients: nutrientsFor(line.name, line.grams),
    fdcId: null,
    matchSource: 'usda' as const,
    confidence: 0.9,
  }));
  return MealSchema.parse({
    id: nextId('meal'),
    loggedAt,
    dayKey,
    slot,
    photoId: null,
    photoUrl: null,
    source: 'photo',
    items,
    totals: sumNutrients(items.map((item) => item.nutrients)),
  });
}

interface MockState {
  user: User;
  pet: Pet | null;
  meals: Meal[];
  feedings: Feeding[];
  plan: MealPlan | null;
}

function seedMeals(): Meal[] {
  const at = (dayOffset: number, hour: number): string => {
    const date = new Date();
    date.setDate(date.getDate() + dayOffset);
    date.setHours(hour, 0, 0, 0);
    return date.toISOString();
  };
  return [
    buildMeal(shiftDayKey(-1), 'dinner', at(-1, 19), [
      { name: 'salmon', grams: 170 },
      { name: 'brown rice, cooked', grams: 180 },
    ]),
    buildMeal(todayKey(), 'breakfast', at(0, 8), [
      { name: 'rolled oats', grams: 60 },
      { name: 'greek yogurt', grams: 150 },
      { name: 'raspberries', grams: 70 },
    ]),
  ];
}

function seedFeedings(): Feeding[] {
  const fedAt = new Date();
  fedAt.setHours(8, 30, 0, 0);
  return [
    {
      id: nextId('feeding'),
      petId: 'mock_pet_1',
      fedAt: fedAt.toISOString(),
      dayKey: todayKey(),
      grams: 92,
      kcal: 314,
      source: 'tap',
    },
  ];
}

function freshState(onboarded: boolean): MockState {
  return {
    user: seedUser(onboarded),
    pet: onboarded ? seedPet() : null,
    meals: onboarded ? seedMeals() : [],
    feedings: onboarded ? seedFeedings() : [],
    plan: null,
  };
}

/**
 * Seeded as a fully onboarded demo account so Home / Log / Plan have something to
 * render immediately. Call `resetMockStore(false)` from a dev screen to walk
 * onboarding from scratch.
 */
let state: MockState = freshState(true);

export function resetMockStore(onboarded = true): void {
  state = freshState(onboarded);
}

// ---------- derivations ----------

function mealsOn(dayKey: string): Meal[] {
  return state.meals.filter((meal) => meal.dayKey === dayKey);
}

function consumedOn(dayKey: string): Nutrients {
  return sumNutrients(mealsOn(dayKey).map((meal) => meal.totals));
}

function buildToday(): TodaySummary {
  const dayKey = todayKey();
  const consumed = consumedOn(dayKey);
  const targets = state.user.targets;
  const humanScore = targets ? scoreFor(consumed.kcal, targets.kcal) : 0;

  const pet = state.pet;
  const fedGrams = state.feedings
    .filter((feeding) => feeding.dayKey === dayKey)
    .reduce((total, feeding) => total + feeding.grams, 0);
  const fedKcal = state.feedings
    .filter((feeding) => feeding.dayKey === dayKey)
    .reduce((total, feeding) => total + feeding.kcal, 0);
  const petScore = pet ? scoreFor(fedGrams, pet.targets.portionGramsPerDay) : 0;

  const combined = pet ? Math.round((humanScore + petScore) / 2) : humanScore;
  const state_ = avatarStateFor(combined);

  return TodaySummarySchema.parse({
    dayKey,
    human: {
      consumed,
      targets: {
        kcal: targets?.kcal ?? 0,
        proteinG: targets?.proteinG ?? 0,
        carbsG: targets?.carbsG ?? 0,
        fatG: targets?.fatG ?? 0,
      },
      score: humanScore,
      mealsLogged: mealsOn(dayKey).length,
    },
    pet: pet
      ? {
          petId: pet.id,
          name: pet.name,
          species: pet.species,
          fedGrams,
          targetGrams: pet.targets.portionGramsPerDay,
          fedKcal,
          targetKcal: pet.targets.kcal,
          feedingsToday: state.feedings.filter((feeding) => feeding.dayKey === dayKey).length,
          mealsPerDay: pet.targets.mealsPerDay,
          score: petScore,
        }
      : null,
    combined,
    avatarState: state_,
    mood: state_,
    streak: { length: 5, todayCounted: combined >= 70, bothAboveThreshold: humanScore >= 70 && petScore >= 70 },
    avatar: pet?.avatar ?? null,
    adjustments: pet
      ? [
          {
            subject: 'pet',
            message: `${pet.name}'s portion moved to ${pet.targets.portionGramsPerDay} g/day (−5%) after the last weigh-in.`,
            at: new Date(Date.now() - 86_400_000).toISOString(),
          },
        ]
      : [],
  });
}

// ---------- micro targets for the gaps endpoint ----------

const MICRO_TARGETS: Partial<Record<keyof Nutrients, number>> = {
  fiberG: 38,
  potassiumMg: 3400,
  calciumMg: 1000,
  ironMg: 8,
  magnesiumMg: 420,
  zincMg: 11,
  vitaminCMg: 90,
  vitaminDUg: 20,
  vitaminARaeUg: 900,
  folateUg: 400,
  vitaminB12Ug: 2.4,
};

const MICRO_LABELS: Partial<Record<keyof Nutrients, string>> = {
  fiberG: 'Fiber',
  potassiumMg: 'Potassium',
  calciumMg: 'Calcium',
  ironMg: 'Iron',
  magnesiumMg: 'Magnesium',
  zincMg: 'Zinc',
  vitaminCMg: 'Vitamin C',
  vitaminDUg: 'Vitamin D',
  vitaminARaeUg: 'Vitamin A',
  folateUg: 'Folate',
  vitaminB12Ug: 'Vitamin B12',
};

const MICRO_FOODS: Partial<Record<keyof Nutrients, string[]>> = {
  fiberG: ['lentils', 'raspberries', 'oats'],
  potassiumMg: ['banana', 'white beans', 'spinach'],
  calciumMg: ['greek yogurt', 'kale', 'sardines'],
  ironMg: ['lentils', 'spinach', 'pumpkin seeds'],
  magnesiumMg: ['almonds', 'black beans', 'oats'],
  zincMg: ['chickpeas', 'cashews', 'oysters'],
  vitaminCMg: ['bell pepper', 'kiwi', 'broccoli'],
  vitaminDUg: ['salmon', 'fortified milk', 'egg yolk'],
  vitaminARaeUg: ['sweet potato', 'carrots', 'spinach'],
  folateUg: ['lentils', 'asparagus', 'avocado'],
  vitaminB12Ug: ['salmon', 'greek yogurt', 'fortified cereal'],
};

// ---------- route handlers ----------

export function bootstrap(): { user: User } {
  return { user: state.user };
}

export function putProfile(input: unknown): { user: User } {
  const profile = HumanProfileSchema.parse(input);
  state.user = UserSchema.parse({
    ...state.user,
    profile,
    targets: seedTargets(),
    // The real server decides this; the mock unlocks the tabs as soon as there is a
    // profile so nobody gets stranded in onboarding.
    onboardingComplete: true,
  });
  return { user: state.user };
}

export function getToday(): TodaySummary {
  return buildToday();
}

export function analyzeMeal(): MealDraft {
  const items = [
    { name: 'Grilled chicken breast', grams: 150 },
    { name: 'Brown rice, cooked', grams: 180 },
    { name: 'Broccoli, steamed', grams: 90 },
  ].map((line) => ({
    name: line.name,
    grams: line.grams,
    nutrients: nutrientsFor(line.name, line.grams),
    fdcId: null,
    matchSource: 'usda' as const,
    confidence: 0.88,
  }));

  return MealDraftSchema.parse({
    photoId: nextId('photo'),
    items,
    totals: sumNutrients(items.map((item) => item.nutrients)),
    analysis: { model: 'mock-vision', latencyMs: 640, fallback: true },
  });
}

export function createMeal(input: unknown): { meal: Meal; today: TodaySummary } {
  const parsed = input as MealCreate;
  const items = parsed.items.map((item) => ({
    name: item.name,
    grams: item.grams,
    nutrients: nutrientsFor(item.name, item.grams),
    fdcId: item.fdcId,
    matchSource: 'usda' as const,
    confidence: 1,
  }));
  const loggedAt = parsed.loggedAt ?? new Date().toISOString();
  const meal = MealSchema.parse({
    id: nextId('meal'),
    loggedAt,
    dayKey: dayKeyOf(new Date(loggedAt)),
    slot: parsed.slot ?? slotForHour(new Date(loggedAt).getHours()),
    photoId: parsed.photoId ?? null,
    photoUrl: null,
    source: parsed.source ?? 'photo',
    items,
    totals: sumNutrients(items.map((item) => item.nutrients)),
  });
  state.meals = [...state.meals, meal];
  return { meal, today: buildToday() };
}

export function listMeals(dayKey: string | null): { meals: Meal[] } {
  return { meals: mealsOn(dayKey ?? todayKey()) };
}

export function deleteMeal(id: string): void {
  state.meals = state.meals.filter((meal) => meal.id !== id);
}

export function getGaps(days: number): GapsResponse {
  const keys = Array.from({ length: days }, (_, index) => shiftDayKey(-index));
  const daily = keys.map((key) => consumedOn(key));
  const summed = sumNutrients(daily);
  const avgEntries = Object.entries(summed).map(([nutrient, value]) => [nutrient, Math.round((value / days) * 10) / 10]);
  const avgIntake = NutrientsSchema.parse(Object.fromEntries(avgEntries));

  const gaps = MICRO_KEYS.flatMap((nutrient) => {
    const target = MICRO_TARGETS[nutrient];
    if (target === undefined) return [];
    const pctOfTarget = Math.round((avgIntake[nutrient] / target) * 100);
    if (pctOfTarget >= 70) return [];
    return [
      {
        nutrient,
        pctOfTarget,
        label: MICRO_LABELS[nutrient] ?? nutrient,
        suggestFoods: MICRO_FOODS[nutrient] ?? [],
      },
    ];
  })
    .sort((a, b) => a.pctOfTarget - b.pctOfTarget)
    .slice(0, 5);

  return GapsResponseSchema.parse({ days, avgIntake, targets: MICRO_TARGETS, gaps });
}

export function generatePlan(input: unknown): { plan: MealPlan } {
  const body = (input ?? {}) as { forDayKey?: string };
  const forDayKey = body.forDayKey ?? shiftDayKey(1);
  const gaps = getGaps(7).gaps;

  const meals = [
    { slot: 'breakfast' as const, title: 'Oats with raspberries and yogurt', lines: [
      { name: 'rolled oats', grams: 70 },
      { name: 'raspberries', grams: 80 },
      { name: 'greek yogurt', grams: 170 },
    ] },
    { slot: 'lunch' as const, title: 'Lentil and spinach bowl', lines: [
      { name: 'lentils', grams: 220 },
      { name: 'spinach', grams: 80 },
      { name: 'olive oil', grams: 10 },
    ] },
    { slot: 'dinner' as const, title: 'Salmon with brown rice and broccoli', lines: [
      { name: 'salmon', grams: 160 },
      { name: 'brown rice, cooked', grams: 200 },
      { name: 'broccoli, steamed', grams: 120 },
    ] },
  ].map((meal) => {
    const nutrients = sumNutrients(meal.lines.map((line) => nutrientsFor(line.name, line.grams)));
    return { slot: meal.slot, title: meal.title, ingredientLines: meal.lines, nutrients };
  });

  const plan = MealPlanSchema.parse({
    id: nextId('plan'),
    forDayKey,
    gaps: gaps.map((gap) => ({ nutrient: gap.nutrient, pctOfTarget: gap.pctOfTarget })),
    meals,
    dayTotals: sumNutrients(meals.map((meal) => meal.nutrients)),
    verified: true,
    attempts: 1,
  });
  state.plan = plan;
  return { plan };
}

export function createPet(input: unknown): { pet: Pet } {
  const petInput = input as PetInput;
  const pet = PetSchema.parse({
    ...seedPet(),
    ...petInput,
    id: 'mock_pet_1',
    userId: state.user.id,
    goal: petInput.weightKg > petInput.idealWeightKg ? 'lose' : 'maintain',
  });
  state.pet = pet;
  state.user = UserSchema.parse({ ...state.user, petId: pet.id });
  return { pet };
}

export function getPet(): { pet: Pet } {
  if (!state.pet) {
    throw new Error('mock: no pet yet');
  }
  return { pet: state.pet };
}

export function createFeeding(input: unknown): { feeding: Feeding; today: TodaySummary } {
  const pet = state.pet;
  if (!pet) {
    throw new Error('mock: no pet yet');
  }
  const body = (input ?? {}) as { grams?: number; fedAt?: string; source?: 'tap' | 'voice' };
  const grams = body.grams ?? Math.round(pet.targets.portionGramsPerDay / pet.targets.mealsPerDay);
  const fedAt = body.fedAt ?? new Date().toISOString();
  const feeding: Feeding = {
    id: nextId('feeding'),
    petId: pet.id,
    fedAt,
    dayKey: dayKeyOf(new Date(fedAt)),
    grams,
    kcal: Math.round((grams / pet.food.gramsPerCup) * pet.food.kcalPerCup),
    source: body.source ?? 'tap',
  };
  state.feedings = [...state.feedings, feeding];
  return { feeding, today: buildToday() };
}

export function getScores(from: string | null, to: string | null): { days: DailyScore[] } {
  const keys = Array.from({ length: 7 }, (_, index) => shiftDayKey(-6 + index)).filter(
    (key) => (from === null || key >= from) && (to === null || key <= to),
  );
  const targets = state.user.targets;
  const pet = state.pet;

  const days = keys.map((dayKey) => {
    const consumed = consumedOn(dayKey);
    const humanScore = targets ? scoreFor(consumed.kcal, targets.kcal) : 0;
    const fedGrams = state.feedings
      .filter((feeding) => feeding.dayKey === dayKey)
      .reduce((total, feeding) => total + feeding.grams, 0);
    const petScore = pet ? scoreFor(fedGrams, pet.targets.portionGramsPerDay) : 0;
    const combined = pet ? Math.round((humanScore + petScore) / 2) : humanScore;
    return DailyScoreSchema.parse({
      dayKey,
      human: {
        consumedKcal: consumed.kcal,
        targetKcal: targets?.kcal ?? 0,
        proteinG: consumed.proteinG,
        score: humanScore,
      },
      pet: {
        fedGrams,
        targetGrams: pet?.targets.portionGramsPerDay ?? 0,
        fedKcal: 0,
        targetKcal: pet?.targets.kcal ?? 0,
        score: petScore,
      },
      combined,
      avatarState: avatarStateFor(combined),
      mood: avatarStateFor(combined),
      streakCounted: combined >= 70,
      streakLength: 5,
      finalized: dayKey !== todayKey(),
    });
  });

  return { days };
}

export function getAvatarStatus(): {
  status: 'none' | 'generating' | 'ready' | 'failed';
  progress: { neutral: boolean; thriving: boolean; drooping: boolean; video: boolean };
  avatar: Pet['avatar'] | null;
} {
  const avatar = state.pet?.avatar ?? null;
  return {
    status: avatar?.status ?? 'none',
    progress: { neutral: true, thriving: true, drooping: true, video: false },
    avatar,
  };
}
