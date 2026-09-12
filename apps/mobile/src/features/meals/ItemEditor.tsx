/**
 * "Add item" — a name field that appends `{ name, grams: 100, fdcId: null }` to the
 * draft. The only way to build a meal when the vision call came back empty.
 */
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, TextField, colors, spacing } from '../../components/ui';
import { MANUAL_ITEM_GRAMS } from './draft';

export interface ItemEditorProps {
  onAdd: (name: string) => void;
}

export function ItemEditor({ onAdd }: ItemEditorProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  const commit = (): void => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    onAdd(trimmed);
    setName('');
    setOpen(false);
  };

  if (!open) {
    return (
      <Button
        title="Add item"
        variant="secondary"
        icon={<Plus size={16} color={colors.text} />}
        onPress={() => setOpen(true)}
        testID="add-item"
      />
    );
  }

  return (
    <View style={styles.editor}>
      <TextField
        style={styles.field}
        value={name}
        onChangeText={setName}
        placeholder="Sourdough toast"
        autoFocus
        returnKeyType="done"
        onSubmitEditing={commit}
        hint={`Starts at ${MANUAL_ITEM_GRAMS} g — adjust it below.`}
      />
      <Button title="Add" onPress={commit} fullWidth={false} disabled={name.trim().length === 0} />
    </View>
  );
}

const styles = StyleSheet.create({
  editor: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  field: { flex: 1 },
});
