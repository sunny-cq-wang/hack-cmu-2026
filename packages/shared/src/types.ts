/**
 * @petplate/shared — single source of truth for every payload.
 * FROZEN after checkpoint C1. Propose changes via a PR titled "shared: <what>".
 */
import { z } from 'zod';

// ---------- primitives ----------
export const DayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const IsoDate = z.string().datetime();
export const Id = z.string().min(1);

export const NutrientsSchema = z.object({
  kcal: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
  fiberG: z.number().default(0),
  sodiumMg: z.number().default(0),
  potassiumMg: z.number().default(0),
  calciumMg: z.number().default(0),
  ironMg: z.number().default(0),
  magnesiumMg: z.number().default(0),
  zincMg: z.number().default(0),
  vitaminCMg: z.number().default(0),
  vitaminDUg: z.number().default(0),
  vitaminARaeUg: z.number().default(0),
  folateUg: z.number().default(0),
  vitaminB12Ug: z.number().default(0),
});
export type Nutrients = z.infer<typeof NutrientsSchema>;
export const NUTRIENT_KEYS = Object.keys(NutrientsSchema.shape) as (keyof Nutrients)[];
export const MICRO_KEYS: (keyof Nutrients)[] = [
  'fiberG','sodiumMg','potassiumMg','calciumMg','ironMg','magnesiumMg','zincMg',
  'vitaminCMg','vitaminDUg','vitaminARaeUg','folateUg','vitaminB12Ug',
];
export const emptyNutrients = (): Nutrients => NutrientsSchema.parse({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });

export const AvatarStateSchema = z.enum(['thriving', 'okay', 'drooping']);
export type AvatarState = z.infer<typeof AvatarStateSchema>;

// ---------- human ----------
export const SexSchema = z.enum(['male', 'female']);
export const ActivitySchema = z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']);
export const GoalSchema = z.enum(['lose', 'maintain', 'gain']);

export const HumanProfileSchema = z.object({
  sex: SexSchema,
  age: z.number().int().min(13).max(100),
  heightCm: z.number().min(100).max(250),
  weightKg: z.number().min(30).max(300),
  activity: ActivitySchema,
  goal: GoalSchema,
  targetWeightKg: z.number().min(30).max(300).nullable(),
  dietaryPrefs: z.array(z.string()).default([]),
  allergies: z.array(z.string()).default([]),
});
export type HumanProfile = z.infer<typeof HumanProfileSchema>;

export const HumanTargetsSchema = z.object({
  kcal: z.number(),
  baseKcal: z.number(),
  adaptiveOffsetKcal: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
  micros: NutrientsSchema.partial(),
  computedAt: IsoDate,
  lastAdjustedAt: IsoDate.nullable().default(null),
});
export type HumanTargets = z.infer<typeof HumanTargetsSchema>;

export const UserSchema = z.object({
  id: Id,
  email: z.string(),
  name: z.string(),
  timezone: z.string(),
  onboardingComplete: z.boolean(),
  petId: Id.nullable(),
  profile: HumanProfileSchema.nullable(),
  targets: HumanTargetsSchema.nullable(),
});
export type User = z.infer<typeof UserSchema>;

// ---------- pet ----------
export const SpeciesSchema = z.enum(['dog', 'cat', 'virtual']);
export const PetActivitySchema = z.enum(['low', 'normal', 'high']);
export const PetFoodSchema = z.object({
  name: z.string().default('Dry food'),
  kcalPerCup: z.number().positive().default(375),
  gramsPerCup: z.number().positive().default(110),
});
export const PetInputSchema = z.object({
  name: z.string().min(1),
  species: SpeciesSchema,
  breed: z.string().nullable().default(null),
  sex: z.enum(['male', 'female']).nullable().default(null),
  neutered: z.boolean().default(true),
  ageYears: z.number().min(0).max(30).nullable().default(null),
  weightKg: z.number().positive(),
  idealWeightKg: z.number().positive(),
  activity: PetActivitySchema.default('normal'),
  food: PetFoodSchema.default({}),
  mealsPerDay: z.number().int().min(1).max(4).default(2),
});
export type PetInput = z.infer<typeof PetInputSchema>;

export const PetTargetsSchema = z.object({
  rerKcal: z.number(),
  merFactor: z.number(),
  baseKcal: z.number(),
  adaptivePct: z.number(),
  kcal: z.number(),
  portionGramsPerDay: z.number(),
  mealsPerDay: z.number(),
  computedAt: IsoDate,
  lastAdjustedAt: IsoDate.nullable().default(null),
});
export type PetTargets = z.infer<typeof PetTargetsSchema>;

export const AvatarInfoSchema = z.object({
  status: z.enum(['none', 'generating', 'ready', 'failed']),
  neutralUrl: z.string().nullable(),
  thrivingUrl: z.string().nullable(),
  droopingUrl: z.string().nullable(),
  celebrationVideoUrl: z.string().nullable(),
  voice: z.string().default('Ara'),
});
export type AvatarInfo = z.infer<typeof AvatarInfoSchema>;

export const PetSchema = PetInputSchema.extend({
  id: Id,
  userId: Id,
  goal: z.enum(['lose', 'maintain']),
  targets: PetTargetsSchema,
  avatar: AvatarInfoSchema,
});
export type Pet = z.infer<typeof PetSchema>;

// ---------- meals ----------
export const MealSlotSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export const MatchSourceSchema = z.enum(['usda', 'nutritionix', 'grok_estimate']);

export const VisionItemSchema = z.object({
  name: z.string(),
  grams: z.number().nonnegative(),
  confidence: z.number().min(0).max(1),
  usdaQuery: z.string(),
  estimatedKcal: z.number().nonnegative(),
});
export const VisionResultSchema = z.object({
  items: z.array(VisionItemSchema),
  mealNotes: z.string().optional(),
});
export type VisionResult = z.infer<typeof VisionResultSchema>;

export const MealItemSchema = z.object({
  name: z.string(),
  grams: z.number().nonnegative(),
  nutrients: NutrientsSchema,
  fdcId: z.number().nullable(),
  matchSource: MatchSourceSchema,
  confidence: z.number().min(0).max(1).default(1),
});
export type MealItem = z.infer<typeof MealItemSchema>;

export const MealDraftSchema = z.object({
  photoId: Id.nullable(),
  items: z.array(MealItemSchema),
  totals: NutrientsSchema,
  analysis: z.object({ model: z.string(), latencyMs: z.number(), fallback: z.boolean() }),
});
export type MealDraft = z.infer<typeof MealDraftSchema>;

export const MealCreateSchema = z.object({
  photoId: Id.nullable().default(null),
  slot: MealSlotSchema.optional(),
  loggedAt: IsoDate.optional(),
  source: z.enum(['photo', 'manual', 'voice', 'plan']).default('photo'),
  items: z.array(z.object({ name: z.string(), grams: z.number().positive(), fdcId: z.number().nullable().default(null) })).min(1),
});
export type MealCreate = z.infer<typeof MealCreateSchema>;

export const MealSchema = z.object({
  id: Id,
  loggedAt: IsoDate,
  dayKey: DayKey,
  slot: MealSlotSchema,
  photoId: Id.nullable(),
  photoUrl: z.string().nullable(),
  source: z.enum(['photo', 'manual', 'voice', 'plan']),
  items: z.array(MealItemSchema),
  totals: NutrientsSchema,
});
export type Meal = z.infer<typeof MealSchema>;

// ---------- feedings / weigh-ins ----------
export const FeedingCreateSchema = z.object({
  grams: z.number().positive().optional(),
  fedAt: IsoDate.optional(),
  source: z.enum(['tap', 'voice']).default('tap'),
});
export const FeedingSchema = z.object({
  id: Id, petId: Id, fedAt: IsoDate, dayKey: DayKey, grams: z.number(), kcal: z.number(),
  source: z.enum(['tap', 'voice']),
});
export type Feeding = z.infer<typeof FeedingSchema>;

export const WeighInCreateSchema = z.object({
  subjectType: z.enum(['user', 'pet']),
  subjectId: Id,
  weightKg: z.number().positive(),
  weighedAt: IsoDate.optional(),
  note: z.string().nullable().default(null),
});
export const WeighInSchema = WeighInCreateSchema.extend({ id: Id, weighedAt: IsoDate });
export type WeighIn = z.infer<typeof WeighInSchema>;

export const TrendSchema = z.object({
  points: z.array(z.object({ at: IsoDate, kg: z.number() })),
  slopeKgPerWeek: z.number().nullable(),
  projectedGoalDate: DayKey.nullable(),
});
export type Trend = z.infer<typeof TrendSchema>;

export const AdjustmentSchema = z.object({
  applied: z.boolean(),
  before: z.object({ kcal: z.number(), portionGramsPerDay: z.number().optional() }),
  after: z.object({ kcal: z.number(), portionGramsPerDay: z.number().optional() }),
  observedWeeklyChangePct: z.number().nullable(),
  targetWeeklyChangePct: z.tuple([z.number(), z.number()]).nullable(),
  message: z.string(),
  vetFlag: z.boolean().default(false),
});
export type Adjustment = z.infer<typeof AdjustmentSchema>;

export const WeighInResponseSchema = z.object({ weighIn: WeighInSchema, adjustment: AdjustmentSchema, trend: TrendSchema });

// ---------- scores / today ----------
export const DailyScoreSchema = z.object({
  dayKey: DayKey,
  human: z.object({ consumedKcal: z.number(), targetKcal: z.number(), proteinG: z.number(), score: z.number() }),
  pet: z.object({ fedGrams: z.number(), targetGrams: z.number(), fedKcal: z.number(), targetKcal: z.number(), score: z.number() }),
  combined: z.number(),
  avatarState: AvatarStateSchema,
  mood: AvatarStateSchema,
  streakCounted: z.boolean(),
  streakLength: z.number(),
  finalized: z.boolean(),
});
export type DailyScore = z.infer<typeof DailyScoreSchema>;

export const TodaySummarySchema = z.object({
  dayKey: DayKey,
  human: z.object({
    consumed: NutrientsSchema,
    targets: z.object({ kcal: z.number(), proteinG: z.number(), carbsG: z.number(), fatG: z.number() }),
    score: z.number(),
    mealsLogged: z.number(),
  }),
  pet: z.object({
    petId: Id, name: z.string(), species: SpeciesSchema,
    fedGrams: z.number(), targetGrams: z.number(), fedKcal: z.number(), targetKcal: z.number(),
    feedingsToday: z.number(), mealsPerDay: z.number(), score: z.number(),
  }).nullable(),
  combined: z.number(),
  avatarState: AvatarStateSchema,
  mood: AvatarStateSchema,
  streak: z.object({ length: z.number(), todayCounted: z.boolean(), bothAboveThreshold: z.boolean() }),
  avatar: AvatarInfoSchema.nullable(),
  adjustments: z.array(z.object({ subject: z.enum(['user', 'pet']), message: z.string(), at: IsoDate })),
});
export type TodaySummary = z.infer<typeof TodaySummarySchema>;

// ---------- nutrition / plans ----------
export const GapSchema = z.object({
  nutrient: z.enum(MICRO_KEYS as [keyof Nutrients, ...(keyof Nutrients)[]]),
  pctOfTarget: z.number(),
  label: z.string(),
  suggestFoods: z.array(z.string()),
});
export const GapsResponseSchema = z.object({
  days: z.number(),
  avgIntake: NutrientsSchema,
  targets: NutrientsSchema.partial(),
  gaps: z.array(GapSchema),
});
export type GapsResponse = z.infer<typeof GapsResponseSchema>;

export const MealPlanProposalSchema = z.object({
  meals: z.array(z.object({
    slot: MealSlotSchema,
    title: z.string(),
    ingredientLines: z.array(z.object({ name: z.string(), grams: z.number().positive(), usdaQuery: z.string() })).min(1),
  })).length(3),
});
export type MealPlanProposal = z.infer<typeof MealPlanProposalSchema>;

/**
 * Free-text steering the user types for the planner ("include salmon twice").
 * Untrusted input: it travels as a delimited field inside the user message and is
 * never concatenated into a system prompt.
 */
export const MealPlanInstructions = z.string().trim().max(500);

/** `POST /mealplans/generate` request body. */
export const MealPlanGenerateRequestSchema = z.object({
  forDayKey: DayKey.optional(),
  customInstructions: MealPlanInstructions.optional(),
});
export type MealPlanGenerateRequest = z.infer<typeof MealPlanGenerateRequestSchema>;

export const MealPlanSchema = z.object({
  id: Id,
  forDayKey: DayKey,
  gaps: z.array(z.object({ nutrient: z.string(), pctOfTarget: z.number() })),
  meals: z.array(z.object({
    slot: MealSlotSchema, title: z.string(),
    ingredientLines: z.array(z.object({ name: z.string(), grams: z.number() })),
    nutrients: NutrientsSchema,
  })),
  dayTotals: NutrientsSchema,
  verified: z.boolean(),
  attempts: z.number(),
  /** What the user asked for, echoed back so the UI can show "Built with: …". */
  customInstructions: MealPlanInstructions.nullable().default(null),
});
export type MealPlan = z.infer<typeof MealPlanSchema>;

// ---------- voice ----------
export const VoiceActionSchema = z.object({
  type: z.enum(['log_feeding', 'suggest_meal', 'none']),
  payload: z.record(z.unknown()).default({}),
});
export const VoiceTurnResponseSchema = z.object({
  transcript: z.string(),
  reply: z.string(),
  audioBase64: z.string().nullable(),
  audioMime: z.string().nullable(),
  actions: z.array(VoiceActionSchema),
  today: TodaySummarySchema,
});
export type VoiceTurnResponse = z.infer<typeof VoiceTurnResponseSchema>;

// ---------- avatar ----------
export const AvatarStatusSchema = z.object({
  status: z.enum(['none', 'generating', 'ready', 'failed']),
  progress: z.object({ neutral: z.boolean(), thriving: z.boolean(), drooping: z.boolean(), video: z.boolean() }),
  avatar: AvatarInfoSchema.nullable(),
});
export type AvatarStatus = z.infer<typeof AvatarStatusSchema>;

// ---------- errors ----------
export const ErrorCode = z.enum([
  'UNAUTHORIZED','FORBIDDEN','NOT_FOUND','VALIDATION_ERROR','ONBOARDING_REQUIRED',
  'UPSTREAM_TIMEOUT','UPSTREAM_ERROR','RATE_LIMITED','INTERNAL',
]);
export const ApiErrorSchema = z.object({ error: z.object({ code: ErrorCode, message: z.string() }) });
