import { HumanProfileSchema, type HumanProfile } from '@petplate/shared';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Button,
  Chip,
  Segmented,
  TextField,
  colors,
  spacing,
  typography,
  type SegmentedOption,
} from '../../src/components/ui';
import { isApiError } from '../../src/lib/api';
import { useUpdateProfile } from '../../src/lib/queries';

// `@petplate/shared` exports the schemas but not these three unions, so derive them
// from `HumanProfile` rather than retyping the literals (AGENTS.md §4.2).
type Sex = HumanProfile['sex'];
type Activity = HumanProfile['activity'];
type Goal = HumanProfile['goal'];

// Unit conversion only — the server still owns every calorie and target (AGENTS.md §4.3).
const CM_PER_FOOT = 30.48;
const CM_PER_INCH = 2.54;
const KG_PER_LB = 0.45359237;

const SEX_OPTIONS: SegmentedOption<Sex>[] = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
];

const GOAL_OPTIONS: SegmentedOption<Goal>[] = [
  { label: 'Lose', value: 'lose' },
  { label: 'Maintain', value: 'maintain' },
  { label: 'Gain', value: 'gain' },
];

const ACTIVITY_OPTIONS: SegmentedOption<Activity>[] = [
  { label: 'Sedentary', value: 'sedentary', description: 'Desk job, little planned exercise.' },
  { label: 'Light', value: 'light', description: 'Light movement or exercise 1–3 days a week.' },
  { label: 'Moderate', value: 'moderate', description: 'Exercise 3–5 days a week.' },
  { label: 'Active', value: 'active', description: 'Hard exercise 6–7 days a week.' },
  { label: 'Very active', value: 'very_active', description: 'Physical job or two sessions a day.' },
];

const DIETARY_PREFS = ['vegetarian', 'vegan', 'pescatarian', 'halal', 'kosher', 'gluten-free'] as const;

type HeightUnit = 'cm' | 'ftin';
type WeightUnit = 'kg' | 'lb';

const toNumber = (raw: string): number => {
  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) ? value : Number.NaN;
};

const round1 = (value: number): number => Math.round(value * 10) / 10;

export default function OnboardingProfile(): React.JSX.Element {
  const router = useRouter();
  const updateProfile = useUpdateProfile();

  const [sex, setSex] = useState<Sex | null>(null);
  const [age, setAge] = useState('');
  const [heightUnit, setHeightUnit] = useState<HeightUnit>('cm');
  const [heightCm, setHeightCm] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg');
  const [weight, setWeight] = useState('');
  const [activity, setActivity] = useState<Activity | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [targetWeight, setTargetWeight] = useState('');
  const [dietaryPrefs, setDietaryPrefs] = useState<string[]>([]);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [allergyDraft, setAllergyDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const resolvedHeightCm = useMemo(() => {
    if (heightUnit === 'cm') return toNumber(heightCm);
    const feet = heightFt ? toNumber(heightFt) : 0;
    const inches = heightIn ? toNumber(heightIn) : 0;
    return round1(feet * CM_PER_FOOT + inches * CM_PER_INCH);
  }, [heightCm, heightFt, heightIn, heightUnit]);

  const toKg = (raw: string): number => {
    const value = toNumber(raw);
    return weightUnit === 'kg' ? value : round1(value * KG_PER_LB);
  };

  const needsTargetWeight = goal === 'lose' || goal === 'gain';

  const toggle = (list: string[], entry: string): string[] =>
    list.includes(entry) ? list.filter((item) => item !== entry) : [...list, entry];

  const addAllergy = (): void => {
    const entry = allergyDraft.trim().toLowerCase();
    if (entry && !allergies.includes(entry)) {
      setAllergies([...allergies, entry]);
    }
    setAllergyDraft('');
  };

  const submit = (): void => {
    setError(null);
    const candidate = {
      sex,
      age: toNumber(age),
      heightCm: resolvedHeightCm,
      weightKg: toKg(weight),
      activity,
      goal,
      targetWeightKg: needsTargetWeight ? toKg(targetWeight) : null,
      dietaryPrefs,
      allergies,
    };

    const parsed = HumanProfileSchema.safeParse(candidate);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      setError(first ? `${first.path.join('.') || 'profile'}: ${first.message}` : 'Please check the form.');
      return;
    }

    updateProfile.mutate(parsed.data, {
      onSuccess: () => router.push('/onboarding/pet'),
      onError: (cause) =>
        setError(isApiError(cause) ? cause.message : 'Could not save your profile. Try again.'),
    });
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={typography.title}>About you</Text>
            <Text style={typography.caption}>
              We use this once, on the server, to work out your calorie and protein targets.
            </Text>
          </View>

          <Segmented label="Sex" options={SEX_OPTIONS} value={sex} onChange={setSex} />

          <TextField label="Age" value={age} onChangeText={setAge} keyboardType="number-pad" suffix="years" />

          <View style={styles.group}>
            <Segmented
              label="Height"
              options={[
                { label: 'cm', value: 'cm' as HeightUnit },
                { label: 'ft / in', value: 'ftin' as HeightUnit },
              ]}
              value={heightUnit}
              onChange={setHeightUnit}
            />
            {heightUnit === 'cm' ? (
              <TextField value={heightCm} onChangeText={setHeightCm} keyboardType="decimal-pad" suffix="cm" />
            ) : (
              <View style={styles.row}>
                <TextField
                  style={styles.flex}
                  value={heightFt}
                  onChangeText={setHeightFt}
                  keyboardType="number-pad"
                  suffix="ft"
                />
                <TextField
                  style={styles.flex}
                  value={heightIn}
                  onChangeText={setHeightIn}
                  keyboardType="number-pad"
                  suffix="in"
                />
              </View>
            )}
            {heightUnit === 'ftin' && Number.isFinite(resolvedHeightCm) && resolvedHeightCm > 0 ? (
              <Text style={typography.caption}>= {resolvedHeightCm} cm</Text>
            ) : null}
          </View>

          <View style={styles.group}>
            <Segmented
              label="Weight"
              options={[
                { label: 'kg', value: 'kg' as WeightUnit },
                { label: 'lb', value: 'lb' as WeightUnit },
              ]}
              value={weightUnit}
              onChange={setWeightUnit}
            />
            <TextField value={weight} onChangeText={setWeight} keyboardType="decimal-pad" suffix={weightUnit} />
          </View>

          <Segmented
            label="Activity"
            orientation="vertical"
            options={ACTIVITY_OPTIONS}
            value={activity}
            onChange={setActivity}
          />

          <Segmented label="Goal" options={GOAL_OPTIONS} value={goal} onChange={setGoal} />

          {needsTargetWeight ? (
            <TextField
              label="Target weight"
              value={targetWeight}
              onChangeText={setTargetWeight}
              keyboardType="decimal-pad"
              suffix={weightUnit}
            />
          ) : null}

          <View style={styles.group}>
            <Text style={typography.label}>Dietary preferences</Text>
            <View style={styles.chips}>
              {DIETARY_PREFS.map((pref) => (
                <Chip
                  key={pref}
                  label={pref}
                  selected={dietaryPrefs.includes(pref)}
                  onPress={() => setDietaryPrefs(toggle(dietaryPrefs, pref))}
                />
              ))}
            </View>
          </View>

          <View style={styles.group}>
            <TextField
              label="Allergies"
              value={allergyDraft}
              onChangeText={setAllergyDraft}
              placeholder="peanuts"
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={addAllergy}
              hint="Type one and press return."
            />
            {allergies.length > 0 ? (
              <View style={styles.chips}>
                {allergies.map((allergy) => (
                  <Chip
                    key={allergy}
                    label={allergy}
                    selected
                    onRemove={() => setAllergies(allergies.filter((item) => item !== allergy))}
                  />
                ))}
              </View>
            ) : null}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button title="Continue" onPress={submit} loading={updateProfile.isPending} />
          <Text style={[typography.caption, styles.disclaimer]}>Not medical or veterinary advice.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  header: { gap: spacing.xs },
  group: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  error: { ...typography.caption, color: colors.drooping },
  disclaimer: { textAlign: 'center' },
});
