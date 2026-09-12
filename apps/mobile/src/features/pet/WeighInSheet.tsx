import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from './theme';
import { isApiError } from '../../lib/api';
import { useCreateWeighIn } from './queries';

const HUMAN_MIN_KG = 30;
const HUMAN_MAX_KG = 300;

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
  const [error, setError] = useState<string | null>(null);
  const forHuman = props.subjectType === 'user';

  async function submit() {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      setError('Enter a weight greater than 0.');
      return;
    }
    const weightKg = kg ? n : n / 2.20462;
    if (forHuman && (weightKg < HUMAN_MIN_KG || weightKg > HUMAN_MAX_KG)) {
      setError(`Human weight must be between ${HUMAN_MIN_KG} and ${HUMAN_MAX_KG} kg.`);
      return;
    }
    setError(null);
    try {
      const res = await create.mutateAsync({
        subjectType: props.subjectType,
        subjectId: props.subjectId,
        weightKg,
      });
      props.onMessage?.(res.adjustment.message, res.adjustment.vetFlag ?? false);
      props.onClose();
      setValue('');
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Could not save this weigh-in.');
    }
  }

  function close() {
    setError(null);
    props.onClose();
  }

  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Dismiss weigh-in" />
        <View style={styles.sheet}>
          <Text style={styles.title}>{forHuman ? 'Log your weigh-in' : 'Log pet weigh-in'}</Text>
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
            onChangeText={(next) => {
              setValue(next);
              if (error) setError(null);
            }}
            keyboardType="decimal-pad"
            placeholder={kg ? 'Weight (kg)' : 'Weight (lb)'}
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={styles.btn} onPress={() => void submit()} disabled={create.isPending}>
            <Text style={styles.btnText}>{create.isPending ? 'Saving…' : 'Save'}</Text>
          </Pressable>
        </View>
      </View>
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
  error: { color: colors.drooping },
});
