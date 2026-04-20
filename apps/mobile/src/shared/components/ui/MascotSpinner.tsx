import { Image } from "expo-image";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";

import listLoadingMascot from "../../../../assets/images/hf_20260417_153650_6b4ae03c-6655-475d-9d52-c7da89fe4b2e.gif";

const PIXEL_BY_SIZE = {
  small: 32,
  large: 56,
} as const;

export interface MascotSpinnerProps {
  size?: "small" | "large";
  /** Явный размер в px (перекрывает size) */
  pixelSize?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Анимированный маскот вместо ActivityIndicator (единый GIF по приложению).
 */
export function MascotSpinner({ size = "small", pixelSize, style }: MascotSpinnerProps) {
  const dim = pixelSize ?? PIXEL_BY_SIZE[size];
  return (
    <View
      style={[styles.wrap, style]}
      accessibilityRole="progressbar"
      accessibilityLabel="Загрузка"
    >
      <Image
        source={listLoadingMascot}
        style={{ width: dim, height: dim }}
        contentFit="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
});
