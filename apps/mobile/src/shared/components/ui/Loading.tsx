import { View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Text } from "react-native-paper";

import { COLORS, FONTS, SPACING, BORDER_RADIUS } from "@/shared/config";
import { TexturedSafeAreaView } from "../TexturedSafeAreaView";
import { LoadingMascot } from "./LoadingMascot";

interface LoadingProps {
  message?: string;
  /** One reusable loading card; embedded removes its frame inside an existing card. */
  variant?: "card" | "inline" | "embedded";
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
  variant = "card",
  fullScreen = false,
  embedded = false,
  style,
}: LoadingProps) {
  const content = (
    <View
      style={[
        styles.container,
        (variant === "inline" || variant === "embedded") && styles.inlineContainer,
        fullScreen && styles.containerFullScreen,
        style,
      ]}
      accessibilityRole="progressbar"
      accessibilityLabel={message ?? "Загрузка"}
    >
      <View style={[styles.card, variant === "embedded" && styles.embeddedCard]}>
        <View style={styles.mascotFrame} pointerEvents="none">
          <LoadingMascot />
        </View>
        <View style={styles.content}>
          <Text style={styles.message} numberOfLines={3}>
            {message ?? "Загружаем…"}
          </Text>
        </View>
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
  fullScreen: { flex: 1, backgroundColor: COLORS.background },
  container: {
    padding: SPACING.md,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  containerFullScreen: { flex: 1 },
  inlineContainer: { paddingVertical: SPACING.xs, paddingHorizontal: 0 },
  card: {
    width: "100%",
    maxWidth: 440,
    flexDirection: "column",
    gap: 10,
    alignItems: "center",
    backgroundColor: "#FFFAF0",
    borderWidth: 1,
    borderColor: "rgba(77, 92, 45, 0.16)",
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.lg,
    shadowColor: "#352E2E",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  embeddedCard: {
    backgroundColor: "transparent",
    borderWidth: 0,
    paddingHorizontal: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  mascotFrame: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 12,
  },
  content: { width: "100%", alignItems: "center" },
  message: {
    color: COLORS.primary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    fontFamily: FONTS.montserratMedium,
  },
});
