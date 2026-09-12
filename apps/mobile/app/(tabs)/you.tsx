// Human goals / weigh-ins live on this tab so the Pet tab stays pet-only.
import { StyleSheet, View } from 'react-native';

import { colors } from '../../src/components/ui';
import { HumanScreen } from '../../src/features/pet';

export default function YouTab(): React.JSX.Element {
  return (
    <View style={styles.screen}>
      <HumanScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
});
