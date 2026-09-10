import { Platform, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";

import { COLORS, FONTS, SPACING } from "@/shared/config";

type PageHeaderProps = {
  title: string;
  description: string;
};

/**
 * Единая шапка для основных вкладок: название сразу объясняет экран,
 * а краткая строка помогает сориентироваться, не превращая шапку в баннер.
 */
export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <View style={styles.root} accessible accessibilityRole="header">
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "rgba(255, 248, 229, 0.19)",
    borderColor: "rgba(255, 253, 244, 0.94)",
    borderRadius: 14,
    borderWidth: 1,
    marginTop: SPACING.xs,
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    ...Platform.select({
      ios: {
        shadowColor: "#4A4A1E",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
    }),
  },
  title: {
    color: COLORS.text,
    fontFamily: FONTS.impact,
    fontSize: 30,
    lineHeight: 36,
  },
  description: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
    fontSize: 14,
    lineHeight: 20,
    marginTop: SPACING.xs,
  },
});
