import { useState, useCallback } from "react";
import { 
  View, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform,
  ScrollView,
  Pressable,
} from "react-native";
import { Text, Snackbar } from "react-native-paper";
import { Link, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { z } from "zod";

import { Button, Input } from "@/shared/components/ui";
import { useAuthStore } from "@/shared/stores";
import { COLORS, SPACING, BORDER_RADIUS } from "@/constants";

// Схема валидации
const loginSchema = z.object({
  username: z.string().min(3, "Минимум 3 символа"),
  password: z.string().min(6, "Минимум 6 символов"),
});

type FormErrors = {
  username?: string;
  password?: string;
};

/**
 * Страница авторизации
 */
export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuthStore();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

  const validateForm = useCallback((): boolean => {
    const result = loginSchema.safeParse({ username, password });
    
    if (!result.success) {
      const fieldErrors: FormErrors = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as keyof FormErrors;
        fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);
      return false;
    }
    
    setErrors({});
    return true;
  }, [username, password]);

  const handleLogin = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const result = await login(username, password);
      
      if (result.success) {
        router.replace("/");
      } else {
        setSnackbar({ 
          visible: true, 
          message: result.error || "Ошибка авторизации" 
        });
      }
    } catch (error) {
      setSnackbar({ 
        visible: true, 
        message: "Ошибка подключения к серверу" 
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Логотип и заголовок */}
          <View style={styles.header}>
            <Text style={styles.logo}>Гафус!</Text>
            <Text variant="bodyLarge" style={styles.subtitle}>
              Войдите в свой аккаунт
            </Text>
          </View>

          {/* Форма */}
          <View style={styles.form}>
            <Input
              label="Имя пользователя"
              value={username}
              onChangeText={setUsername}
              error={errors.username}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              testID="username-input"
            />

            <Input
              label="Пароль"
              value={password}
              onChangeText={setPassword}
              error={errors.password}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
              testID="password-input"
            />

            <Button
              label={isLoading ? "Вход..." : "Войти"}
              onPress={handleLogin}
              loading={isLoading}
              disabled={isLoading}
              style={styles.button}
              testID="login-button"
            />
          </View>

          {/* Ссылки */}
          <View style={styles.links}>
            <Link href="/reset-password" asChild>
              <Pressable>
                <Text style={styles.link}>Забыли пароль?</Text>
              </Pressable>
            </Link>

            <View style={styles.registerRow}>
              <Text style={styles.registerText}>Нет аккаунта? </Text>
              <Link href="/register" asChild>
                <Pressable>
                  <Text style={styles.link}>Зарегистрироваться</Text>
                </Pressable>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Уведомление об ошибке */}
      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: "" })}
        duration={3000}
        action={{
          label: "OK",
          onPress: () => setSnackbar({ visible: false, message: "" }),
        }}
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
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: SPACING.xl,
  },
  header: {
    alignItems: "center",
    marginBottom: SPACING.xxl,
  },
  logo: {
    color: COLORS.primary,
    fontWeight: "400",
    fontSize: 60,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    color: COLORS.textSecondary,
  },
  form: {
    marginBottom: SPACING.xl,
  },
  button: {
    marginTop: SPACING.md,
  },
  links: {
    alignItems: "center",
    gap: SPACING.md,
  },
  link: {
    color: COLORS.secondary,
    fontWeight: "600",
  },
  registerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  registerText: {
    color: COLORS.textSecondary,
  },
});
