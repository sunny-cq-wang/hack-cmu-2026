import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, usePetPagePad } from './theme';
import { HumanForm } from './HumanForm';
import { WeighInSheet } from './WeighInSheet';
import { WeightChart } from './WeightChart';
import { AdjustmentHistory } from './AdjustmentHistory';
import { useAuth } from '../../lib/auth';
import { useMe, useToday, useWeighIns } from './queries';

function goalLabel(goal: 'lose' | 'maintain' | 'gain', targetKg: number | null): string {
  if (goal === 'maintain') return 'Maintaining weight';
  const verb = goal === 'lose' ? 'Losing' : 'Gaining';
  return targetKg != null ? `${verb} weight → ${targetKg} kg` : `${verb} weight`;
}

export function HumanScreen() {
  const pagePad = usePetPagePad();
  const router = useRouter();
  const { signOut, isDevSession } = useAuth();
  const todayQ = useToday();
  const meQ = useMe();
  const userWeigh = useWeighIns('user');
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState<{ message: string; vet: boolean } | null>(null);
  const [editing, setEditing] = useState(false);

  async function onSignOut() {
    await signOut();
    router.replace('/(auth)/login');
  }

  if (todayQ.isLoading || meQ.isLoading) {
    return (
      <View style={[styles.center, pagePad]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (todayQ.isError || meQ.isError) {
    return (
      <View style={[styles.center, pagePad]}>
        <Text style={styles.err}>Could not load your profile.</Text>
        <Pressable onPress={() => void Promise.all([todayQ.refetch(), meQ.refetch()])}>
          <Text style={styles.link}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const me = meQ.data;
  const today = todayQ.data;
  const profile = me?.profile;
  if (!me || !today) {
    return (
      <View style={[styles.center, pagePad]}>
        <Text style={styles.err}>Could not load your profile.</Text>
      </View>
    );
  }
  if (editing && profile) {
    return (
      <HumanForm
        profile={profile}
        onSaved={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const latest = userWeigh.data?.weighIns[0];
  const targetKg = profile?.targetWeightKg ?? profile?.weightKg ?? latest?.weightKg ?? 0;
  const trend = userWeigh.data?.trend;
  const caption =
    trend?.slopeKgPerWeek == null
      ? undefined
      : `${trend.slopeKgPerWeek.toFixed(2)} kg/week${trend.projectedGoalDate ? ` · goal ≈ ${trend.projectedGoalDate}` : ''}`;
  const kcal = me.targets?.kcal ?? today.human.targets.kcal;
  const consumed = today.human.consumed.kcal;
  const protein = today.human.consumed.proteinG;
  const proteinTarget = today.human.targets.proteinG;

  return (
    <ScrollView contentContainerStyle={[styles.page, pagePad]}>
      <View style={styles.header}>
        <Text style={styles.name}>{me.name || 'You'}</Text>
        <View style={styles.chips}>
          {profile ? <Text style={styles.chip}>{goalLabel(profile.goal, profile.targetWeightKg)}</Text> : null}
          {profile ? <Text style={styles.chip}>{profile.activity.replace('_', ' ')}</Text> : null}
        </View>
        {profile ? (
          <Pressable onPress={() => setEditing(true)}>
            <Text style={styles.link}>Edit</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.targetCard}>
        <Text style={styles.big}>{kcal}</Text>
        <Text style={styles.sub}>kcal / day</Text>
        <Text style={styles.progress}>
          {Math.round(consumed)} of {kcal} kcal today · {Math.round(protein)} / {proteinTarget} g protein
        </Text>
        {profile ? (
          <Text style={styles.note}>
            {profile.sex === 'female' ? 'Female' : 'Male'}, {profile.age} · {profile.heightCm} cm
            {profile.weightKg ? ` · ${profile.weightKg} kg` : ''}
          </Text>
        ) : (
          <Text style={styles.note}>Finish onboarding to set a calorie target.</Text>
        )}
      </View>
      <WeightChart
        trend={trend}
        weighIns={userWeigh.data?.weighIns}
        idealWeightKg={targetKg}
        idealLabel="Target"
        tint={colors.accentAlt}
        caption={caption}
        emptyCopy="Log your weight weekly and Kibble & Kale will tune your calorie target automatically."
        accessibilityLabel={`Your weight trend toward ${targetKg} kg.`}
      />
      <Pressable style={styles.secondary} onPress={() => setSheet(true)}>
        <Text style={styles.secondaryText}>Log my weigh-in</Text>
      </Pressable>
      <AdjustmentHistory items={today.adjustments} subject="user" />
      <Pressable onPress={() => void onSignOut()} accessibilityRole="button" accessibilityLabel="Sign out">
        <Text style={styles.link}>Sign out</Text>
      </Pressable>
      {isDevSession ? (
        <Text style={styles.footer}>
          You’re in the shared demo account, so this data is everyone’s. Sign out and choose
          “Create an account” to start a private one.
        </Text>
      ) : null}
      <Text style={styles.footer}>
        Calorie targets are estimates. Not medical advice — confirm with your clinician.
      </Text>
      {toast ? (
        <View style={[styles.toast, toast.vet && styles.toastVet]}>
          <Text style={styles.toastText}>
            {toast.message}
            {toast.vet ? ' Consider checking with your clinician.' : ''}
          </Text>
        </View>
      ) : null}
      <WeighInSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        subjectType="user"
        subjectId={me.id}
        onMessage={(message, vetFlag) => setToast({ message, vet: vetFlag })}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 16, backgroundColor: colors.bg, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, gap: 8 },
  header: { gap: 8 },
  name: { color: colors.text, fontSize: 32, fontWeight: '700' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { backgroundColor: colors.card, color: colors.text, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden', textTransform: 'capitalize' },
  link: { color: colors.accent },
  targetCard: { backgroundColor: colors.card, borderRadius: 16, padding: 20, gap: 6 },
  big: { color: colors.text, fontSize: 48, fontWeight: '700' },
  sub: { color: colors.muted, fontSize: 14 },
  progress: { color: colors.text, marginTop: 8 },
  note: { color: colors.muted, fontSize: 13 },
  secondary: { borderWidth: 1, borderColor: colors.accent, borderRadius: 12, padding: 12, alignItems: 'center' },
  secondaryText: { color: colors.accent, fontWeight: '600' },
  footer: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  err: { color: colors.drooping },
  toast: { backgroundColor: colors.card, padding: 12, borderRadius: 10 },
  toastVet: { backgroundColor: colors.okay },
  toastText: { color: colors.text },
});
