/** Today's meals, under the camera on the Log tab. Thumbnails, totals, swipe to delete. */
import type { Meal } from '@petplate/shared';
import { Image } from 'expo-image';
import { UtensilsCrossed } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, Skeleton, colors, radius, spacing, typography } from '../../components/ui';
import { isApiError } from '../../lib/api';
import { config } from '../../lib/config';
import { useDeleteMeal, useMeals } from '../../lib/queries';
import { SwipeToDelete } from './SwipeToDelete';
import { slotLabel } from './slots';

export interface MealListProps {
  /** Defaults to the device's local day, like `useMeals()` itself. */
  dayKey?: string;
}

/** `Meal.photoUrl` comes back as an API-relative path (`/api/photos/:id`). */
function photoSource(photoUrl: string | null): string | null {
  if (!photoUrl) {
    return null;
  }
  return /^https?:\/\//i.test(photoUrl) ? photoUrl : `${config.apiBase}${photoUrl}`;
}

function loggedAtLabel(meal: Meal): string {
  return new Date(meal.loggedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function MealList({ dayKey }: MealListProps): React.JSX.Element {
  const meals = useMeals(dayKey);
  const deleteMeal = useDeleteMeal();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const remove = (mealId: string): void => {
    setDeleteError(null);
    deleteMeal.mutate(mealId, {
      onError: (cause) =>
        setDeleteError(isApiError(cause) ? cause.message : 'Could not delete that meal. Try again.'),
    });
  };

  if (meals.isPending) {
    return (
      <View style={styles.list}>
        <Skeleton height={78} borderRadius={radius.lg} />
        <Skeleton height={78} borderRadius={radius.lg} />
      </View>
    );
  }

  if (meals.isError) {
    return (
      <Card>
        <Text style={typography.body}>Could not load today's meals.</Text>
        <Text style={typography.caption}>{meals.error.message}</Text>
        <Button title="Try again" variant="secondary" onPress={() => void meals.refetch()} />
      </Card>
    );
  }

  if (meals.data.length === 0) {
    return (
      <Card>
        <Text style={typography.body}>No meals logged today yet.</Text>
        <Text style={typography.caption}>Point the camera at your plate and press the shutter.</Text>
      </Card>
    );
  }

  return (
    <View style={styles.list}>
      {deleteError ? <Text style={styles.error}>{deleteError}</Text> : null}
      {meals.data.map((meal) => {
        const uri = photoSource(meal.photoUrl);
        return (
          <SwipeToDelete key={meal.id} onDelete={() => remove(meal.id)} disabled={deleteMeal.isPending}>
            <Card style={styles.row}>
              {uri ? (
                <Image source={{ uri }} style={styles.thumb} contentFit="cover" transition={120} />
              ) : (
                <View style={[styles.thumb, styles.thumbFallback]}>
                  <UtensilsCrossed size={20} color={colors.textFaint} />
                </View>
              )}
              <View style={styles.body}>
                <Text style={typography.body} numberOfLines={1}>
                  {slotLabel(meal.slot)} · {loggedAtLabel(meal)}
                </Text>
                <Text style={typography.caption} numberOfLines={1}>
                  {meal.items.map((item) => item.name).join(', ') || 'No items'}
                </Text>
                <Text style={typography.label}>
                  {Math.round(meal.totals.kcal)} kcal · {Math.round(meal.totals.proteinG)} g protein
                </Text>
              </View>
            </Card>
          </SwipeToDelete>
        );
      })}
      <Text style={typography.caption}>Swipe a meal left to delete it.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  thumb: { width: 54, height: 54, borderRadius: radius.md, backgroundColor: colors.cardRaised },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  error: { ...typography.caption, color: colors.drooping },
});
