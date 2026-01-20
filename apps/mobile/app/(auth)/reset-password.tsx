import { useState, useCallback } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Text, Snackbar } from "react-native-paper";
import { Link, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { z } from "zod";

import { Button, Input } from "@/shared/components/ui";
import { COLORS, SPACING } from "@/constants";

const emailSchema = z.string().email("Некорректный email");

/**
 * Страница сброса пароля
 */
export default function ResetPasswordScreen() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

  const validateEmail = useCallback((): boolean => {
    const result = emailSchema.safeParse(email);
    if (!result.success) {
      setError(result.error.errors[0].message);
      return false;
    }
    setError(undefined);
    return true;
  }, [email]);

  const handleReset = async () => {
    if (!validateEmail()) return;

    setIsLoading(true);
    try {
      // TODO: Реализовать API для сброса пароля
      // const result = await authApi.resetPassword(email);
      
      setSnackbar({ 
        visible: true, 
        message: "Инструкции отправлены на email" 
      });
      
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (error) {
      setSnackbar({ 
        visible: true, 
        message: "Ошибка отправки. Попробуйте позже." 
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Заголовок */}
        <View style={styles.header}>
          <Text variant="headlineMedium" style={styles.title}>
            Сброс пароля
          </Text>
          <Text variant="bodyLarge" style={styles.subtitle}>
            Введите email для получения инструкций
          </Text>
        </View>

        {/* Форма */}
        <View style={styles.form}>
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            error={error}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />

          <Button
            label={isLoading ? "Отправка..." : "Отправить"}
            onPress={handleReset}
            loading={isLoading}
            disabled={isLoading}
            style={styles.button}
          />
        </View>

        {/* Ссылка назад */}
        <Link href="/login" asChild>
          <Pressable style={styles.backLink}>
            <Text style={styles.link}>← Вернуться к входу</Text>
          </Pressable>
        </Link>
      </View>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: "" })}
        duration={3000}
      >
        {snackbar.message}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    padding: SPACING.xl,
  },
  header: {
    alignItems: "center",
    marginBottom: SPACING.xl,
  },
  title: {
    fontWeight: "bold",
    marginBottom: SPACING.sm,
  },
  subtitle: {
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  form: {
    marginBottom: SPACING.xl,
  },
  button: {
    marginTop: SPACING.md,
  },
  backLink: {
    alignItems: "center",
  },
  link: {
    color: COLORS.primary,
    fontWeight: "600",
  },
});
