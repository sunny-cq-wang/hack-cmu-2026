/**
 * The `reviewing` half of the Log tab: edit what the vision model saw, pick a slot,
 * confirm. Nothing in here is authoritative — every number the user sees is either a
 * value the server already sent or a labelled estimate (AGENTS.md §4.3).
 */
import { MICRO_KEYS, type MealDraft, type Nutrients } from '@petplate/shared';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, Segmented, Sheet, colors, spacing, typography } from '../../components/ui';
import type { MealCreateInput } from '../../lib/contracts';
import { estimatedKcal, manualItem, toDraftItems, type DraftItem } from './draft';
import { ItemEditor } from './ItemEditor';
import { ItemRow } from './ItemRow';
import { SLOT_OPTIONS, slotForHour, type MealSlot } from './slots';
import { SwipeToDelete } from './SwipeToDelete';

export interface AnalyzeSheetProps {
  visible: boolean;
  draft: MealDraft;
  /** Set when analysis failed, e.g. "Couldn't analyze — add items manually". */
  notice: string | null;
  /** Set when the save itself failed. */
  error: string | null;
  saving: boolean;
  /** Null when there is no photo to try again with. */
  onRetryAnalysis: (() => void) | null;
  onCancel: () => void;
  onConfirm: (input: MealCreateInput) => void;
}

/** The four micros the brief asks for, proven against the shared key list. */
const SHEET_MICROS = [
  { key: 'fiberG', label: 'Fiber', unit: 'g' },
  { key: 'ironMg', label: 'Iron', unit: 'mg' },
  { key: 'potassiumMg', label: 'Potassium', unit: 'mg' },
  { key: 'vitaminCMg', label: 'Vitamin C', unit: 'mg' },
] as const satisfies readonly { key: (typeof MICRO_KEYS)[number]; label: string; unit: string }[];

const round = (value: number): number => Math.round(value * 10) / 10;

export function AnalyzeSheet({
  visible,
  draft,
  notice,
  error,
  saving,
  onRetryAnalysis,
  onCancel,
  onConfirm,
}: AnalyzeSheetProps): React.JSX.Element {
  const [items, setItems] = useState<DraftItem[]>(() => toDraftItems(draft));
  const [slot, setSlot] = useState<MealSlot>(() => slotForHour(new Date().getHours()));

  // A new draft (new photo, or the empty manual one) resets the editor.
  useEffect(() => {
    setItems(toDraftItems(draft));
  }, [draft]);

  // Sum of the per-row DISPLAY-ONLY estimates. Shown as "≈" and never sent.
  const estimatedTotalKcal = useMemo(
    () => items.reduce((sum, item) => sum + (estimatedKcal(item) ?? 0), 0),
    [items],
  );

  const totals: Nutrients = draft.totals;
  const canConfirm = items.length > 0 && items.every((item) => item.grams > 0 && item.name.trim().length > 0);

  const replace = (next: DraftItem): void =>
    setItems((current) => current.map((item) => (item.key === next.key ? next : item)));

  const remove = (key: string): void => setItems((current) => current.filter((item) => item.key !== key));

  const confirm = (): void => {
    onConfirm({
      photoId: draft.photoId,
      slot,
      // A draft with no photoId only exists when the user typed the meal in.
      source: draft.photoId === null ? 'manual' : 'photo',
      items: items.map((item) => ({ name: item.name.trim(), grams: item.grams, fdcId: item.fdcId })),
    });
  };

  return (
    <Sheet visible={visible} onClose={saving ? () => undefined : onCancel} title="Check the plate">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {notice ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{notice}</Text>
            {onRetryAnalysis ? (
              <Button title="Try analyzing again" variant="secondary" onPress={onRetryAnalysis} />
            ) : null}
          </View>
        ) : null}

        <Segmented label="Slot" options={SLOT_OPTIONS} value={slot} onChange={setSlot} />

        {items.length === 0 ? (
          <Text style={typography.caption}>
            Nothing on the plate yet. Add what you ate and PetPlate will price it on the server.
          </Text>
        ) : (
          <View style={styles.items}>
            {items.map((item) => (
              <SwipeToDelete key={item.key} onDelete={() => remove(item.key)} disabled={saving}>
                <ItemRow item={item} onChange={replace} />
              </SwipeToDelete>
            ))}
            <Text style={typography.caption}>Swipe an item left to remove it.</Text>
          </View>
        )}

        <ItemEditor onAdd={(name) => setItems((current) => [...current, manualItem(name)])} />

        <View style={styles.totals}>
          <Text style={typography.heading}>≈ {estimatedTotalKcal} kcal</Text>
          <Text style={typography.caption}>
            Estimate only — the server recalculates every item from USDA when you save.
          </Text>
        </View>

        {draft.items.length > 0 ? (
          <View style={styles.micros}>
            <Text style={typography.label}>Micros from the analysis</Text>
            <View style={styles.chips}>
              {SHEET_MICROS.map((micro) => (
                <Chip key={micro.key} label={`${micro.label} ${round(totals[micro.key])} ${micro.unit}`} />
              ))}
            </View>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          title="Log this meal"
          onPress={confirm}
          loading={saving}
          disabled={!canConfirm}
          testID="confirm-meal"
        />
        <Button title="Discard" variant="ghost" onPress={onCancel} disabled={saving} />
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: spacing.lg },
  items: { gap: spacing.sm },
  notice: { gap: spacing.sm },
  noticeText: { ...typography.body, color: colors.okay },
  totals: { gap: spacing.xs },
  micros: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  error: { ...typography.body, color: colors.drooping },
});
