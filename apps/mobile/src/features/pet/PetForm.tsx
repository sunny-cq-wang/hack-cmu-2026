import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PetInputSchema, PetSchema, type Pet } from '@petplate/shared';
import { colors } from './theme';
import { useSavePet } from './queries';

const LB = 2.20462;

export function PetForm(props: { onSaved: (pet: Pet) => void; existing?: Pet }) {
  const save = useSavePet();
  const ex = props.existing;
  const [name, setName] = useState(ex?.name ?? '');
  const [species, setSpecies] = useState<Pet['species']>(ex?.species ?? 'dog');
  const [breed, setBreed] = useState(ex?.breed ?? '');
  const [sex, setSex] = useState<Pet['sex']>(ex?.sex ?? 'male');
  const [neutered, setNeutered] = useState(ex?.neutered ?? true);
  const [age, setAge] = useState(ex?.ageYears != null ? String(ex.ageYears) : '');
  const [kg, setKg] = useState(true);
  const [weight, setWeight] = useState(ex ? String(ex.weightKg) : '');
  const [ideal, setIdeal] = useState(ex ? String(ex.idealWeightKg) : '');
  const [activity, setActivity] = useState<Pet['activity']>(ex?.activity ?? 'normal');
  const [meals, setMeals] = useState(String(ex?.targets.mealsPerDay ?? 2));
  const [foodName, setFoodName] = useState(ex?.food.name ?? '');
  const [kcalCup, setKcalCup] = useState(String(ex?.food.kcalPerCup ?? 375));
  const [gramsCup, setGramsCup] = useState(String(ex?.food.gramsPerCup ?? 110));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Pet | null>(null);

  const virtual = species === 'virtual';

  async function submit() {
    setError(null);
    const toKg = (raw: string) => {
      const n = Number(raw);
      return kg ? n : n / LB;
    };
    const parsed = PetInputSchema.safeParse({
      name,
      species,
      breed: breed || null,
      sex,
      neutered,
      ageYears: age === '' ? null : Number(age),
      weightKg: virtual ? 10 : toKg(weight),
      idealWeightKg: virtual ? 10 : toKg(ideal),
      activity,
      mealsPerDay: Number(meals),
      food: {
        name: foodName || 'Dry food',
        kcalPerCup: Number(kcalCup),
        gramsPerCup: Number(gramsCup),
      },
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the form');
      return;
    }
    try {
      const res = await save.mutateAsync({ existing: props.existing, body: parsed.data });
      const pet = PetSchema.parse(res.pet);
      setSaved(pet);
      props.onSaved(pet);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save pet');
    }
  }

  const perDay = saved?.targets.portionGramsPerDay;
  const perMeal = saved && saved.targets.mealsPerDay > 0 ? Math.round(saved.targets.portionGramsPerDay / saved.targets.mealsPerDay) : null;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.h1}>{props.existing ? 'Edit pet' : 'Your pet'}</Text>
      <Field label="Name" value={name} onChange={setName} />
      <Seg label="Species" value={species} options={['dog', 'cat', 'virtual']} onChange={(v) => setSpecies(v as Pet['species'])} />
      <Field label="Breed (optional, for the avatar)" value={breed} onChange={setBreed} />
      <Seg label="Sex" value={sex ?? 'male'} options={['male', 'female']} onChange={(v) => setSex(v as Pet['sex'])} />
      <Pressable onPress={() => setNeutered((n) => !n)} style={styles.toggle}>
        <Text style={styles.label}>Neutered: {neutered ? 'yes' : 'no'}</Text>
      </Pressable>
      <Field label="Age (years)" value={age} onChange={setAge} keyboard="decimal-pad" />
      {!virtual ? (
        <>
          <Seg label="Units" value={kg ? 'kg' : 'lb'} options={['kg', 'lb']} onChange={(v) => setKg(v === 'kg')} />
          <Field label={`Current weight (${kg ? 'kg' : 'lb'})`} value={weight} onChange={setWeight} keyboard="decimal-pad" />
          <Field
            label={`Ideal weight (${kg ? 'kg' : 'lb'})`}
            value={ideal}
            onChange={setIdeal}
            keyboard="decimal-pad"
            hint="Ask your vet, or use the weight from their last healthy checkup"
          />
        </>
      ) : (
        <Text style={styles.hint}>Virtual pet uses a fixed 10 kg healthy-adult profile. No weigh-ins needed.</Text>
      )}
      <Seg label="Activity" value={activity} options={['low', 'normal', 'high']} onChange={(v) => setActivity(v as Pet['activity'])} />
      <Seg label="Meals per day" value={meals} options={['1', '2', '3', '4']} onChange={setMeals} />
      <Field label="Food name" value={foodName} onChange={setFoodName} />
      <Field label="kcal per cup" value={kcalCup} onChange={setKcalCup} keyboard="decimal-pad" hint="On the bag: 'kcal/cup'. Leave default if unsure." />
      <Field label="grams per cup" value={gramsCup} onChange={setGramsCup} keyboard="decimal-pad" />
      {error ? <Text style={styles.err}>{error}</Text> : null}
      <Pressable style={styles.btn} onPress={() => void submit()} disabled={save.isPending}>
        <Text style={styles.btnText}>{save.isPending ? 'Saving…' : 'Save pet'}</Text>
      </Pressable>
      {saved && perDay != null && perMeal != null ? (
        <View style={styles.success}>
          <Text style={styles.successText}>
            {saved.name} gets {perDay} g/day ({perMeal} g × {saved.targets.mealsPerDay})
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboard?: 'decimal-pad' | 'default';
  hint?: string;
}) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChange}
        keyboardType={props.keyboard}
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
      {props.hint ? <Text style={styles.hint}>{props.hint}</Text> : null}
    </View>
  );
}

function Seg<T extends string>(props: { label: string; value: T; options: T[]; onChange: (v: T) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{props.label}</Text>
      <View style={styles.row}>
        {props.options.map((o) => (
          <Pressable key={o} onPress={() => props.onChange(o)} style={[styles.chip, props.value === o && styles.chipOn]}>
            <Text style={styles.chipText}>{o}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 14, backgroundColor: colors.bg },
  h1: { color: colors.text, fontSize: 28, fontWeight: '700' },
  label: { color: colors.muted, fontSize: 13 },
  input: { backgroundColor: colors.card, color: colors.text, borderRadius: 10, padding: 12 },
  hint: { color: colors.muted, fontSize: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  chipOn: { backgroundColor: colors.accent },
  chipText: { color: colors.text, textTransform: 'capitalize' },
  toggle: { paddingVertical: 8 },
  btn: { backgroundColor: colors.thriving, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  btnText: { color: colors.bg, fontWeight: '700' },
  err: { color: colors.drooping },
  success: { backgroundColor: colors.card, padding: 16, borderRadius: 12 },
  successText: { color: colors.thriving, fontWeight: '600' },
});
