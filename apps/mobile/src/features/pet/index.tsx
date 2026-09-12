// PLACEHOLDER — P3 replaces this file (delete it, do not merge into it).
//
// Exports exactly the interface `tasks/P1_MOBILE_CORE.md` §6 promises, so the
// onboarding and Pet routes already compile against the real signatures.
import { SpeciesSchema, type Pet } from '@petplate/shared';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Segmented, TextField, colors, spacing, typography } from '../../components/ui';
import { isApiError } from '../../lib/api';
import type { PetFormInput } from '../../lib/contracts';
import { useCreatePet } from '../../lib/queries';

export interface PetFormProps {
  onSaved: (pet: Pet) => void;
  existing?: Pet;
}

const SPECIES_OPTIONS = SpeciesSchema.options.map((species) => ({
  label: species === 'virtual' ? 'Virtual' : species === 'dog' ? 'Dog' : 'Cat',
  value: species,
}));

export function PetForm({ onSaved, existing }: PetFormProps): React.JSX.Element {
  const createPet = useCreatePet();
  const [name, setName] = useState(existing?.name ?? '');
  const [species, setSpecies] = useState(existing?.species ?? 'dog');
  const [weightKg, setWeightKg] = useState(existing ? String(existing.weightKg) : '');
  const [idealWeightKg, setIdealWeightKg] = useState(existing ? String(existing.idealWeightKg) : '');
  const [error, setError] = useState<string | null>(null);

  const submit = (input: PetFormInput): void => {
    setError(null);
    createPet.mutate(input, {
      onSuccess: onSaved,
      onError: (cause) =>
        setError(isApiError(cause) ? cause.message : 'Could not save your pet. Try again.'),
    });
  };

  const save = (): void => {
    const weight = Number(weightKg);
    const ideal = Number(idealWeightKg);
    if (!name.trim() || !Number.isFinite(weight) || weight <= 0 || !Number.isFinite(ideal) || ideal <= 0) {
      setError('Name, current weight and ideal weight are all required.');
      return;
    }
    submit({ name: name.trim(), species, weightKg: weight, idealWeightKg: ideal });
  };

  const skip = (): void =>
    submit({ name: 'Pixel', species: 'virtual', weightKg: 10, idealWeightKg: 10 });

  return (
    <View style={styles.form}>
      <Text style={typography.caption}>Placeholder form — P3 ships the real one.</Text>
      <TextField label="Name" value={name} onChangeText={setName} placeholder="Biscuit" />
      <Segmented label="Species" options={SPECIES_OPTIONS} value={species} onChange={setSpecies} />
      <TextField
        label="Current weight"
        value={weightKg}
        onChangeText={setWeightKg}
        keyboardType="decimal-pad"
        suffix="kg"
      />
      <TextField
        label="Ideal weight"
        value={idealWeightKg}
        onChangeText={setIdealWeightKg}
        keyboardType="decimal-pad"
        suffix="kg"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Save pet" onPress={save} loading={createPet.isPending} />
      <Button title="Skip (virtual pet)" variant="ghost" onPress={skip} disabled={createPet.isPending} />
    </View>
  );
}

export function PetScreen(): React.JSX.Element {
  return (
    <View style={styles.screen}>
      <Text style={typography.heading}>Pet screen coming from P3</Text>
      <Text style={typography.caption}>Portion, feedings, weigh-ins and the weight chart live here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  error: { ...typography.caption, color: colors.drooping },
});
