import { View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Text } from "react-native-paper";

import { COLORS, FONTS, SPACING, BORDER_RADIUS } from "@/shared/config";
import { TexturedSafeAreaView } from "../TexturedSafeAreaView";
import { LoadingMascot } from "./LoadingMascot";

const MASCOT_PX = {
  large: 168,
  small: 112,
} as const;

const INLINE_MASCOT_PX = {
  large: 56,
  small: 32,
} as const;

interface LoadingProps {
  message?: string;
  size?: "small" | "large";
  /** Компактная загрузка внутри уже открытого блока, без дополнительной карточки. */
  variant?: "card" | "inline";
  fullScreen?: boolean;
  /** Экран уже предоставляет фон и safe-area: загрузка только заполняет его содержимое. */
  embedded?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Полноэкранная или карточная загрузка: анимация-маскот вместо спиннера.
 */
export function Loading({
  message,
  size = "large",
  variant = "card",
  fullScreen = false,
  embedded = false,
  style,
}: LoadingProps) {
  const mascotPx = (variant === "inline" ? INLINE_MASCOT_PX : MASCOT_PX)[size];
  const content = (
    <View
      style={[
        styles.container,
        variant === "inline" && styles.inlineContainer,
        fullScreen && styles.containerFullScreen,
        style,
      ]}
      accessibilityRole="progressbar"
      accessibilityLabel={message ?? "Загрузка"}
    >
      <View style={variant === "card" ? styles.card : styles.inlineContent}>
        <LoadingMascot pixelSize={mascotPx} />
        {message ? (
          <Text style={[styles.message, variant === "inline" && styles.inlineMessage]}>
            {message}
          </Text>
        ) : null}
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
  inlineContainer: {
    padding: 0,
  },
  inlineContent: {
    alignItems: "center",
    justifyContent: "center",
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
  message: {
    marginTop: SPACING.md,
    color: COLORS.text,
    fontSize: 15,
    fontFamily: FONTS.montserrat,
  },
  inlineMessage: {
    marginTop: SPACING.sm,
  },
});
