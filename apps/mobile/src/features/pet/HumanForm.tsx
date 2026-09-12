import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { HumanProfileSchema, type HumanProfile } from '@petplate/shared';
import { useQueryClient } from '@tanstack/react-query';
import { isApiError } from '../../lib/api';
import { useUpdateProfile } from '../../lib/queries';
import { colors, usePetPagePad } from './theme';

const LB = 2.20462;
const GOALS: HumanProfile['goal'][] = ['lose', 'maintain', 'gain'];
const ACTIVITIES: HumanProfile['activity'][] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
const SEXES: HumanProfile['sex'][] = ['male', 'female'];

export function HumanForm(props: {
  profile: HumanProfile;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const pagePad = usePetPagePad();
  const save = useUpdateProfile();
  const qc = useQueryClient();
  const ex = props.profile;
  const [sex, setSex] = useState<HumanProfile['sex']>(ex.sex);
  const [age, setAge] = useState(String(ex.age));
  const [heightCm, setHeightCm] = useState(String(ex.heightCm));
  const [goal, setGoal] = useState<HumanProfile['goal']>(ex.goal);
  const [activity, setActivity] = useState<HumanProfile['activity']>(ex.activity);
  const [kg, setKg] = useState(true);
  const [target, setTarget] = useState(ex.targetWeightKg != null ? String(ex.targetWeightKg) : '');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const needsTarget = goal === 'lose' || goal === 'gain';
    const raw = Number(target);
    if (needsTarget && (!Number.isFinite(raw) || raw <= 0)) {
      setError('Enter a target weight.');
      return;
    }
    const parsed = HumanProfileSchema.safeParse({
      ...ex,
      sex,
      age: Number(age),
      heightCm: Number(heightCm),
      goal,
      activity,
      targetWeightKg: needsTarget ? (kg ? raw : raw / LB) : null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the form');
      return;
    }
    try {
      await save.mutateAsync(parsed.data);
      await qc.invalidateQueries({ queryKey: ['weighins'] });
      props.onSaved();
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Could not save your profile.');
    }
  }

  const needsTarget = goal === 'lose' || goal === 'gain';

  return (
    <ScrollView contentContainerStyle={[styles.page, pagePad]}>
      <View style={styles.titleRow}>
        <Text style={styles.h1}>Edit you</Text>
        <Pressable onPress={props.onCancel} accessibilityRole="button" accessibilityLabel="Cancel editing">
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>
      <Seg label="Sex" value={sex} options={SEXES} onChange={setSex} />
      <Field label="Age (years)" value={age} onChange={setAge} keyboard="number-pad" />
      <Field label="Height (cm)" value={heightCm} onChange={setHeightCm} keyboard="decimal-pad" />
      <Seg label="Goal" value={goal} options={GOALS} onChange={setGoal} />
      {needsTarget ? (
        <>
          <Seg label="Units" value={kg ? 'kg' : 'lb'} options={['kg', 'lb']} onChange={(v) => setKg(v === 'kg')} />
          <Field
            label={`Target weight (${kg ? 'kg' : 'lb'})`}
            value={target}
            onChange={setTarget}
            keyboard="decimal-pad"
            hint="Used as the dashed line on your weight chart"
          />
        </>
      ) : (
        <Text style={styles.hint}>Maintain uses your current weight as the target.</Text>
      )}
      <Seg label="Activity" value={activity} options={ACTIVITIES} onChange={setActivity} />
      {error ? <Text style={styles.err}>{error}</Text> : null}
      <Pressable style={styles.btn} onPress={() => void submit()} disabled={save.isPending}>
        <Text style={styles.btnText}>{save.isPending ? 'Saving…' : 'Save my goals'}</Text>
      </Pressable>
    </ScrollView>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboard?: 'decimal-pad' | 'number-pad' | 'default';
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
            <Text style={styles.chipText}>{o.replace('_', ' ')}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 14, backgroundColor: colors.bg, paddingBottom: 40 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  h1: { color: colors.text, fontSize: 28, fontWeight: '700', flexShrink: 1 },
  cancel: { color: colors.accent, fontWeight: '600' },
  label: { color: colors.muted, fontSize: 13 },
  input: { backgroundColor: colors.card, color: colors.text, borderRadius: 10, padding: 12 },
  hint: { color: colors.muted, fontSize: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  chipOn: { backgroundColor: colors.accent },
  chipText: { color: colors.text, textTransform: 'capitalize' },
  btn: { backgroundColor: colors.thriving, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  btnText: { color: colors.bg, fontWeight: '700' },
  err: { color: colors.drooping },
});
