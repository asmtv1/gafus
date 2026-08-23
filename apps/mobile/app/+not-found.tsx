import { StyleSheet } from "react-native";
import { Text } from "react-native-paper";
import { Link } from "expo-router";

import { Button } from "@/shared/components/ui";
import { TexturedSafeAreaView } from "@/shared/components";
import { COLORS, SPACING } from "@/shared/config";

/**
 * Экран 404 — страница не найдена
 */
export default function NotFoundScreen() {
  return (
    <TexturedSafeAreaView style={styles.container}>
      <Text style={styles.icon}>🔍</Text>
      <Text variant="headlineMedium" style={styles.title}>
        Страница не найдена
      </Text>
      <Text style={styles.message}>Запрашиваемая страница не существует</Text>
      <Link href="/" asChild>
        <Button label="На главную" style={styles.button} />
      </Link>
    </TexturedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.xl,
    backgroundColor: COLORS.background,
  },
  icon: {
    fontSize: 64,
    marginBottom: SPACING.lg,
  },
  title: {
    fontWeight: "bold",
    marginBottom: SPACING.md,
  },
  message: {
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: SPACING.xl,
  },
  button: {
    minWidth: 200,
  },
});
