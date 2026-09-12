import { Image, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';

const SOURCE = require('../../../assets/images/logo.png');
const ASPECT = 1024 / 559;

export function BrandLogo({
  width = 280,
  style,
}: {
  width?: number;
  style?: StyleProp<ImageStyle>;
}): React.JSX.Element {
  return (
    <Image
      source={SOURCE}
      style={[styles.logo, { width, height: Math.round(width / ASPECT) }, style]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="Kibble & Kale"
    />
  );
}

const styles = StyleSheet.create({
  logo: { alignSelf: 'center' },
});
