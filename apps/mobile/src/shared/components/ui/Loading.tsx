import { View, StyleSheet } from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS, FONTS, SPACING, BORDER_RADIUS } from "@/constants";

interface LoadingProps {
  message?: string;
  size?: "small" | "large";
  fullScreen?: boolean;
}

/**
 * Компонент загрузки в стиле приложения (оливковый, кремовый фон)
 */
export function Loading({ message, size = "large", fullScreen = false }: LoadingProps) {
  const content = (
    <View style={[styles.container, fullScreen && styles.containerFullScreen]}>
      <View style={styles.card}>
        <ActivityIndicator size={size} color={COLORS.primary} />
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
