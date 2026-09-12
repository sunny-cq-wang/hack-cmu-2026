/**
 * Home dashboard. TODO(P1): owns this screen — this is the minimum needed to
 * exercise P4's `PetAvatar` and `TalkButton` on a dev build.
 */
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PetAvatar } from '../src/features/avatar';
import { TalkButton } from '../src/features/voice';
import { useToday } from '../src/lib/queries';

export default function HomeScreen(): React.JSX.Element {
  const { data: today, isLoading, error } = useToday();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>PetPlate</Text>

        <PetAvatar size={220} />

        {isLoading && <Text style={styles.muted}>Loading today…</Text>}
        {error && <Text style={styles.error}>{error.message}</Text>}

        {today && (
          <View style={styles.stats}>
            <Text style={styles.stat}>
              Combined {today.combined} · {today.avatarState} (mood: {today.mood})
            </Text>
            <Text style={styles.stat}>
              You — {Math.round(today.human.consumed.kcal)} / {today.human.targets.kcal} kcal
            </Text>
            {today.pet && (
              <Text style={styles.stat}>
                {today.pet.name} — {today.pet.fedGrams} / {today.pet.targetGrams} g ·{' '}
                {today.pet.feedingsToday} of {today.pet.mealsPerDay} meals
              </Text>
            )}
            <Text style={styles.stat}>
              Streak {today.streak.length}
              {today.streak.todayCounted ? ' ✓ today' : ''}
            </Text>
          </View>
        )}

        <Link href="/onboarding/avatar" style={styles.link}>
          Generate your pet avatar
        </Link>

        <Text style={styles.footer}>Not medical or veterinary advice.</Text>
      </ScrollView>

      <TalkButton />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, gap: 14 },
  heading: { fontSize: 26, fontWeight: '800' },
  stats: { gap: 6 },
  stat: { fontSize: 15, color: '#12141D' },
  muted: { color: '#8A94A6' },
  error: { color: '#B3261E' },
  link: { color: '#5AA9E6', fontWeight: '600', fontSize: 15, paddingVertical: 8 },
  footer: { color: '#8A94A6', fontSize: 12, marginTop: 8 },
});
