import { Image } from "expo-image";
import { View, StyleSheet } from "react-native";
import { Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

import { COLORS, FONTS, SPACING, BORDER_RADIUS } from "@/constants";

import listLoadingMascot from "../../../../assets/images/hf_20260417_153650_6b4ae03c-6655-475d-9d52-c7da89fe4b2e.gif";

const MASCOT_PX = {
  large: 168,
  small: 112,
} as const;

interface LoadingProps {
  message?: string;
  size?: "small" | "large";
  fullScreen?: boolean;
}

/**
 * Полноэкранная или карточная загрузка: анимация-маскот вместо спиннера.
 */
export function Loading({
  message,
  size = "large",
  fullScreen = false,
}: LoadingProps) {
  const mascotPx = MASCOT_PX[size];
  const content = (
    <View style={[styles.container, fullScreen && styles.containerFullScreen]}>
      <View style={styles.card}>
        <Image
          source={listLoadingMascot}
          style={{ width: mascotPx, height: mascotPx }}
          contentFit="contain"
        />
        {message && <Text style={styles.message}>{message}</Text>}
      </View>
    </View>
  );

  if (fullScreen) {
    return (
      <SafeAreaView style={styles.fullScreen} edges={["top", "bottom"]}>
        {content}
      </SafeAreaView>
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
    borderWidth: 2,
    borderColor: COLORS.borderLight,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 200,
  },
  message: {
    marginTop: SPACING.md,
    color: COLORS.text,
    fontSize: 15,
    fontFamily: FONTS.montserrat,
  },
});
