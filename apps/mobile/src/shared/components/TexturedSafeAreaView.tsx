import { type ComponentProps, useContext } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { COLORS } from "@/shared/config";
import { PaperTextureBackground } from "./PaperTextureBackground";
import { SharedSkyBackgroundContext } from "./SharedSkyBackground";

type TexturedSafeAreaViewProps = ComponentProps<typeof SafeAreaView>;

/**
 * Базовый корневой контейнер экранов основного приложения.
 * Держит минеральную фактуру под содержимым, чтобы экрану не нужно было
 * вручную подключать фоновое изображение.
 */
export function TexturedSafeAreaView({
  children,
  style,
  ...safeAreaProps
}: TexturedSafeAreaViewProps) {
  const hasSharedSky = useContext(SharedSkyBackgroundContext);
  return (
    <SafeAreaView
      {...safeAreaProps}
      style={[styles.container, style, hasSharedSky && styles.transparent]}
    >
      {!hasSharedSky && <PaperTextureBackground />}
      <SharedSkyBackgroundContext.Provider value={false}>
        {children}
      </SharedSkyBackgroundContext.Provider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  transparent: { backgroundColor: "transparent" },
  container: {
    position: "relative",
    backgroundColor: COLORS.background,
  },
});
