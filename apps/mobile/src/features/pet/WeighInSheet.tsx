import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from './theme';
import { useCreateWeighIn } from './queries';

export function WeighInSheet(props: {
  visible: boolean;
  onClose: () => void;
  subjectType: 'pet' | 'user';
  subjectId: string;
  onMessage?: (message: string, vetFlag: boolean) => void;
}) {
  const create = useCreateWeighIn();
  const [kg, setKg] = useState(true);
  const [value, setValue] = useState('');

  async function submit() {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return;
    const weightKg = kg ? n : n / 2.20462;
    const res = await create.mutateAsync({ subjectType: props.subjectType, subjectId: props.subjectId, weightKg });
    props.onMessage?.(res.adjustment.message, res.adjustment.vetFlag ?? false);
    props.onClose();
    setValue('');
  }

  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onClose}>
      <Pressable style={styles.backdrop} onPress={props.onClose}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Log weigh-in</Text>
          <View style={styles.row}>
            <Pressable onPress={() => setKg(true)} style={[styles.chip, kg && styles.chipOn]}>
              <Text style={styles.chipText}>kg</Text>
            </Pressable>
            <Pressable onPress={() => setKg(false)} style={[styles.chip, !kg && styles.chipOn]}>
              <Text style={styles.chipText}>lb</Text>
            </Pressable>
          </View>
          <TextInput
            value={value}
            onChangeText={setValue}
            keyboardType="decimal-pad"
            placeholder={kg ? 'Weight (kg)' : 'Weight (lb)'}
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          <Pressable style={styles.btn} onPress={() => void submit()} disabled={create.isPending}>
            <Text style={styles.btnText}>{create.isPending ? 'Saving…' : 'Save'}</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, padding: 24, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 12 },
  title: { color: colors.text, fontSize: 18, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.bg },
  chipOn: { backgroundColor: colors.accent },
  chipText: { color: colors.text },
  input: { backgroundColor: colors.bg, color: colors.text, borderRadius: 10, padding: 12, fontSize: 16 },
  btn: { backgroundColor: colors.thriving, borderRadius: 12, padding: 14, alignItems: 'center' },
  btnText: { color: colors.bg, fontWeight: '700' },
});
