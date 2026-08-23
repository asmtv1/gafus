import { useState } from "react";
import { Image } from "expo-image";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { Text } from "react-native-paper";

import { COLORS, FONTS, SPACING, BORDER_RADIUS } from "@/shared/config";
import { TexturedSafeAreaView } from "../TexturedSafeAreaView";

import listLoadingMascot from "../../../../assets/images/hf_20260417_153650_6b4ae03c-6655-475d-9d52-c7da89fe4b2e.gif";

const MASCOT_PX = {
  large: 168,
  small: 112,
} as const;

interface LoadingProps {
  message?: string;
  size?: "small" | "large";
  fullScreen?: boolean;
  /** Экран уже предоставляет фон и safe-area: загрузка только заполняет его содержимое. */
  embedded?: boolean;
}

/**
 * Полноэкранная или карточная загрузка: анимация-маскот вместо спиннера.
 */
export function Loading({
  message,
  size = "large",
  fullScreen = false,
  embedded = false,
}: LoadingProps) {
  const [mascotLoaded, setMascotLoaded] = useState(false);
  const mascotPx = MASCOT_PX[size];
  const content = (
    <View
      style={[styles.container, fullScreen && styles.containerFullScreen]}
      accessibilityRole="progressbar"
      accessibilityLabel={message ?? "Загрузка"}
    >
      <View style={styles.card}>
        <View style={{ width: mascotPx, height: mascotPx }}>
          <Image
            source={listLoadingMascot}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            cachePolicy="memory-disk"
            onLoad={() => setMascotLoaded(true)}
          />
          {!mascotLoaded ? (
            <View style={styles.mascotFallback}>
              <ActivityIndicator color={COLORS.primary} size="large" />
            </View>
          ) : null}
        </View>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
    </View>
  );

  if (fullScreen && !embedded) {
    return (
      <TexturedSafeAreaView style={styles.fullScreen} edges={["top", "bottom"]}>
        {content}
      </TexturedSafeAreaView>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    padding: SPACING.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  containerFullScreen: {
    flex: 1,
  },
  card: {
    backgroundColor: COLORS.cardBackground,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.72)",
    borderRadius: BORDER_RADIUS.lg,
    borderCurve: "continuous",
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 200,
    boxShadow: "0 8px 18px rgba(53, 52, 16, 0.20)",
  },
  mascotFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  message: {
    marginTop: SPACING.md,
    color: COLORS.text,
    fontSize: 15,
    fontFamily: FONTS.montserrat,
  },
});
