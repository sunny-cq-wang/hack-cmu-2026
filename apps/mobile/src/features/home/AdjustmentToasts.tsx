/**
 * `today.adjustments` as dismissible cards (`tasks/P1_MOBILE_CORE.md` §4, item 5).
 *
 * Dismissal is session-local: the set lives at module scope, so a toast stays gone
 * when Home re-mounts or `/me/today` refetches, and comes back on a fresh app launch.
 * The server never learns about it.
 */
import type { TodaySummary } from '@petplate/shared';
import { PawPrint, User, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, colors, spacing, typography } from '../../components/ui';

type Adjustment = TodaySummary['adjustments'][number];

const dismissed = new Set<string>();

/** Stable per adjustment: the server sends no id, but subject + timestamp is unique. */
function keyFor(item: Adjustment): string {
  return `${item.subject}|${item.at}|${item.message}`;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function relativeTime(iso: string): string {
  const elapsed = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(elapsed) || elapsed < HOUR_MS) {
    return 'just now';
  }
  if (elapsed < DAY_MS) {
    return `${Math.floor(elapsed / HOUR_MS)}h ago`;
  }
  const days = Math.floor(elapsed / DAY_MS);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

export interface AdjustmentToastsProps {
  items: TodaySummary['adjustments'];
}

export function AdjustmentToasts({ items }: AdjustmentToastsProps): React.JSX.Element | null {
  const [, forceRender] = useState(0);
  const visible = items.filter((item) => !dismissed.has(keyFor(item)));

  if (visible.length === 0) {
    return null;
  }

  const dismiss = (item: Adjustment): void => {
    dismissed.add(keyFor(item));
    forceRender((tick) => tick + 1);
  };

  return (
    <View style={styles.stack}>
      {visible.map((item) => (
        <Card key={keyFor(item)} style={styles.toast} testID="adjustment-toast">
          <View style={styles.row}>
            {item.subject === 'pet' ? (
              <PawPrint size={18} color={colors.okay} />
            ) : (
              <User size={18} color={colors.okay} />
            )}
            <View style={styles.body}>
              <Text style={typography.body}>{item.message}</Text>
              <Text style={typography.caption}>{relativeTime(item.at)}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss this update"
              hitSlop={10}
              onPress={() => dismiss(item)}
            >
              <X size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { alignSelf: 'stretch', gap: spacing.sm },
  toast: { borderColor: colors.okay, backgroundColor: colors.cardRaised },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  body: { flex: 1, gap: spacing.xs },
});
