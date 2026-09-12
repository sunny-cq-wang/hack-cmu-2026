import { addDays, format, parseISO } from 'date-fns';
import { emptyNutrients, type MealItem, type Nutrients } from '@petplate/shared';
import { config } from '../src/config';
import { connectDb } from '../src/db/connect';
import {
  DailyScoreModel,
  FeedingModel,
  MealModel,
  MealPlanModel,
  PetModel,
  PhotoModel,
  UserModel,
  WeighInModel,
  type StoredHumanTargets,
  type StoredPetTargets,
} from '../src/db/models';
import { dayKey } from '../src/lib/day';
import { log } from '../src/lib/log';
import { recomputeDay } from '../src/services/scoring';
import { computeHumanTargets } from '../src/services/targets/human';
import { computePetTargets } from '../src/services/targets/pet';

const DEMO_EMAIL = 'demo@petplate.app';
const TZ = 'America/New_York';

function nutrients(partial: Partial<Nutrients>): Nutrients {
  return { ...emptyNutrients(), ...partial };
}

function item(name: string, grams: number, n: Partial<Nutrients>, fdcId: number): MealItem {
  return {
    name,
    grams,
    nutrients: nutrients(n),
    fdcId,
    matchSource: 'usda',
    confidence: 0.9,
  };
}

async function main(): Promise<void> {
  await connectDb();
  const existing = await UserModel.findOne({ email: DEMO_EMAIL });
  if (existing) {
    const uid = existing._id;
    await Promise.all([
      MealModel.deleteMany({ userId: uid }),
      FeedingModel.deleteMany({ userId: uid }),
      WeighInModel.deleteMany({ userId: uid }),
      DailyScoreModel.deleteMany({ userId: uid }),
      MealPlanModel.deleteMany({ userId: uid }),
      PhotoModel.deleteMany({ userId: uid }),
      PetModel.deleteMany({ userId: uid }),
      UserModel.deleteOne({ _id: uid }),
    ]);
    log.info({ email: DEMO_EMAIL }, 'deleted previous demo user data');
  }

  const profile = {
    sex: 'male' as const,
    age: 35,
    heightCm: 178,
    weightKg: 80,
    activity: 'moderate' as const,
    goal: 'lose' as const,
    targetWeightKg: 75,
    dietaryPrefs: [] as string[],
    allergies: [] as string[],
  };
  const humanTargets = computeHumanTargets(profile, 0);
  const storedHuman: StoredHumanTargets = {
    ...humanTargets,
    computedAt: new Date(humanTargets.computedAt),
    lastAdjustedAt: null,
    adjustmentLog: [],
  };

  const user = await UserModel.create({
    auth0Sub: `dev|${DEMO_EMAIL}`,
    email: DEMO_EMAIL,
    name: 'Simon',
    timezone: TZ,
    profile,
    targets: storedHuman,
    petId: null,
    onboardingComplete: true,
  });

  const petInput = {
    name: 'Biscuit',
    species: 'dog' as const,
    breed: 'Beagle mix',
    sex: 'male' as const,
    neutered: true,
    ageYears: 4,
    weightKg: 14,
    idealWeightKg: 12,
    activity: 'normal' as const,
    mealsPerDay: 2,
    food: { name: 'Blue Buffalo Adult', kcalPerCup: 377, gramsPerCup: 110 },
  };
  const petTargets = computePetTargets(petInput);
  const { goal: petGoal, ...petTargetFields } = petTargets;
  const storedPet: StoredPetTargets = {
    ...petTargetFields,
    computedAt: new Date(petTargets.computedAt),
    lastAdjustedAt: null,
    adjustmentLog: [
      {
        subject: 'pet',
        message: "Biscuit's portion moved to 184 g/day (−5%) after last weigh-in.",
        at: addDays(new Date(), -1),
      },
    ],
  };

  const pet = await PetModel.create({
    userId: user._id,
    ...petInput,
    goal: petGoal,
    targets: storedPet,
    avatar: {
      status: 'none',
      sourcePhotoId: null,
      neutralPhotoId: null,
      thrivingPhotoId: null,
      droopingPhotoId: null,
      celebrationVideoUrl: null,
      stylePrompt: '',
      voice: config.GROK_DEFAULT_VOICE,
      imagineJobs: [],
    },
  });
  user.petId = pet._id;
  await user.save();

  const today = parseISO(dayKey(new Date(), TZ));
  const breakfast = [
    item('Oatmeal, cooked', 200, { kcal: 150, proteinG: 6, carbsG: 27, fatG: 3, fiberG: 4 }, 173904),
    item('Blueberries', 80, { kcal: 45, proteinG: 0.6, carbsG: 11, fatG: 0.3, fiberG: 2 }, 171711),
    item('Greek yogurt', 150, { kcal: 140, proteinG: 15, carbsG: 8, fatG: 5, calciumMg: 150 }, 170903),
  ];
  const lunch = [
    item('Grilled chicken breast', 150, { kcal: 248, proteinG: 46, carbsG: 0, fatG: 5.4, zincMg: 1.5 }, 171477),
    item('Brown rice, cooked', 180, { kcal: 200, proteinG: 4.5, carbsG: 42, fatG: 1.6, fiberG: 3.2 }, 169704),
    item('Broccoli, steamed', 100, { kcal: 35, proteinG: 2.4, carbsG: 7, fatG: 0.4, fiberG: 3.3, vitaminCMg: 65 }, 170379),
  ];
  const dinnerGood = [
    item('Salmon, baked', 140, { kcal: 280, proteinG: 28, carbsG: 0, fatG: 18, vitaminDUg: 12, vitaminB12Ug: 4 }, 175167),
    item('Lentils, cooked', 180, { kcal: 210, proteinG: 16, carbsG: 36, fatG: 0.7, fiberG: 14, ironMg: 6, potassiumMg: 730, folateUg: 350 }, 175189),
    item('Spinach, cooked', 80, { kcal: 20, proteinG: 2.4, carbsG: 3, fatG: 0.3, fiberG: 2, vitaminARaeUg: 470 }, 168462),
  ];
  const dinnerBad = [
    item('Pizza slice', 250, { kcal: 720, proteinG: 28, carbsG: 80, fatG: 32, sodiumMg: 1800, fiberG: 3 }, 0),
    item('Cola', 350, { kcal: 140, proteinG: 0, carbsG: 36, fatG: 0 }, 0),
    item('Cookie', 80, { kcal: 380, proteinG: 4, carbsG: 52, fatG: 18, fiberG: 1 }, 0),
  ];

  const slots = [
    { slot: 'breakfast' as const, hour: 8, items: breakfast },
    { slot: 'lunch' as const, hour: 13, items: lunch },
    { slot: 'dinner' as const, hour: 19, items: dinnerGood },
  ];

  for (let i = 13; i >= 0; i -= 1) {
    const day = addDays(today, -i);
    const key = format(day, 'yyyy-MM-dd');
    const bad = i === 5 || i === 10;
    for (const spec of slots) {
      const items = spec.slot === 'dinner' && bad ? dinnerBad : spec.items;
      const totals = items.reduce(
        (acc, it) => {
          (Object.keys(acc) as (keyof Nutrients)[]).forEach((k) => {
            acc[k] += it.nutrients[k];
          });
          return acc;
        },
        emptyNutrients(),
      );
      const loggedAt = new Date(`${key}T${String(spec.hour).padStart(2, '0')}:00:00-04:00`);
      await MealModel.create({
        userId: user._id,
        loggedAt,
        dayKey: key,
        slot: spec.slot,
        photoId: null,
        source: 'photo',
        items,
        totals,
        analysis: null,
      });
    }

    const grams = bad ? 40 : pet.targets.portionGramsPerDay;
    const kcalPerGram = pet.food.kcalPerCup / pet.food.gramsPerCup;
    await FeedingModel.create({
      petId: pet._id,
      userId: user._id,
      fedAt: new Date(`${key}T12:00:00-04:00`),
      dayKey: key,
      grams,
      kcal: Math.round(grams * kcalPerGram),
      source: 'tap',
    });

    await recomputeDay(user._id.toString(), key);
  }

  // Weekly weigh-ins across ~90 days, oldest first. Hand-tuned rather than random
  // so every demo run draws the identical, well-shaped curve: a steady drop, a
  // mid-series plateau with a small uptick (weeks 5–7 / days 56–42 ago), then the
  // trend resuming. Ideal is 12 kg for Biscuit and 75 kg for the human, so both
  // lines stay above their dashed reference line.
  const PET_SERIES_KG = [15.2, 15.05, 14.7, 14.45, 14.15, 13.95, 14.05, 13.9, 13.6, 13.3, 13.05, 12.85, 12.7, 12.6];
  const USER_SERIES_KG = [84.0, 83.6, 83.1, 82.7, 82.4, 82.5, 82.1, 81.6, 81.2, 80.9, 80.4, 80.1, 79.8, 79.5];
  const WEIGHIN_COUNT = PET_SERIES_KG.length;

  for (let i = 0; i < WEIGHIN_COUNT; i += 1) {
    // i = 0 is the oldest (91 days ago); the last one lands on today.
    const daysAgo = (WEIGHIN_COUNT - 1 - i) * 7;
    const key = format(addDays(today, -daysAgo), 'yyyy-MM-dd');
    const at = new Date(`${key}T07:30:00-04:00`);
    await WeighInModel.create({
      subjectType: 'pet',
      subjectId: pet._id,
      userId: user._id,
      weighedAt: at,
      weightKg: PET_SERIES_KG[i] ?? PET_SERIES_KG[WEIGHIN_COUNT - 1]!,
      note: null,
    });
    await WeighInModel.create({
      subjectType: 'user',
      subjectId: user._id,
      userId: user._id,
      weighedAt: at,
      weightKg: USER_SERIES_KG[i] ?? USER_SERIES_KG[WEIGHIN_COUNT - 1]!,
      note: null,
    });
  }

  log.info(
    {
      email: DEMO_EMAIL,
      name: user.name,
      pet: pet.name,
      humanKcal: user.targets?.kcal,
      petPortionG: pet.targets.portionGramsPerDay,
      hint: `curl -H "x-dev-user: ${DEMO_EMAIL}" http://localhost:${config.PORT}/api/me/today`,
      note: 'Set DEV_BYPASS_AUTH=true. P3 recomputeDay will finalize streak math.',
    },
    'demo seed complete',
  );
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    log.error({ err }, 'seed failed');
    process.exit(1);
  });
