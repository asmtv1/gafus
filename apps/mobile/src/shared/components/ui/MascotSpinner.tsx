import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";

import { LoadingMascot } from "./LoadingMascot";

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
      <LoadingMascot pixelSize={dim} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
});
