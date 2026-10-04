import { type ComponentProps } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { COLORS } from "@/shared/config";
import { PaperTextureBackground } from "./PaperTextureBackground";

type TexturedSafeAreaViewProps = ComponentProps<typeof SafeAreaView> & {
  inheritBackground?: boolean;
};

/**
 * Базовый корневой контейнер экранов основного приложения.
 * Держит минеральную фактуру под содержимым, чтобы экрану не нужно было
 * вручную подключать фоновое изображение.
 */
export function TexturedSafeAreaView({
  children,
  style,
  inheritBackground = false,
  ...safeAreaProps
}: TexturedSafeAreaViewProps) {
  return (
    <SafeAreaView
      {...safeAreaProps}
      style={[styles.container, inheritBackground && { backgroundColor: "transparent" }, style]}
    >
      {!inheritBackground && <PaperTextureBackground />}
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    backgroundColor: COLORS.background,
  },
});
