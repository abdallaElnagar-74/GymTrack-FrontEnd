import { Image, type ImageStyle, type StyleProp } from 'react-native';

import { mode } from '../theme';

const LOGO = {
  dark: require('../../assets/images/logo-on-dark.png'),
  light: require('../../assets/images/logo-on-light.png'),
};

/** The GymTrack logo in the colours of the current theme (light or dark). */
export function Logo({ size = 120, style }: { size?: number; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={LOGO[mode]}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
      accessibilityLabel="GymTrack"
    />
  );
}
