import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";

import { LoadingMascot } from "./LoadingMascot";

export interface MascotSpinnerProps {
  style?: StyleProp<ViewStyle>;
}

/**
 * Стандартный 168px маскот вместо ActivityIndicator (без компактного режима).
 */
export function MascotSpinner({ style }: MascotSpinnerProps) {
  return (
    <View
      style={[styles.wrap, style]}
      accessibilityRole="progressbar"
      accessibilityLabel="Загрузка"
    >
      <LoadingMascot />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
});
