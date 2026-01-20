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
import { authApi } from "@/shared/lib/api";
import { useAuthStore } from "@/shared/stores";
import { COLORS, SPACING } from "@/constants";

// Схема валидации
const registerSchema = z.object({
  username: z.string()
    .min(3, "Минимум 3 символа")
    .max(50, "Максимум 50 символов")
    .regex(/^[a-zA-Z0-9_]+$/, "Только латиница, цифры и _"),
  email: z.string().email("Некорректный email").optional().or(z.literal("")),
  password: z.string().min(6, "Минимум 6 символов"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Пароли не совпадают",
  path: ["confirmPassword"],
});

type FormErrors = {
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
};

/**
 * Страница регистрации
 */
export default function RegisterScreen() {
  const router = useRouter();

  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Очищаем ошибку поля при изменении
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const validateForm = useCallback((): boolean => {
    const result = registerSchema.safeParse(form);
    
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
  }, [form]);

  const handleRegister = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const result = await authApi.register({
        username: form.username,
        password: form.password,
        email: form.email || undefined,
      });
      
      if (result.success) {
        setSnackbar({ 
          visible: true, 
          message: "Регистрация успешна! Выполняется вход..." 
        });
        
        // Автоматический вход после регистрации
        setTimeout(() => {
          router.replace("/login");
        }, 1500);
      } else {
        setSnackbar({ 
          visible: true, 
          message: result.error || "Ошибка регистрации" 
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
          {/* Заголовок */}
          <View style={styles.header}>
            <Text variant="headlineMedium" style={styles.title}>
              Регистрация
            </Text>
            <Text variant="bodyLarge" style={styles.subtitle}>
              Создайте новый аккаунт
            </Text>
          </View>

          {/* Форма */}
          <View style={styles.form}>
            <Input
              label="Имя пользователя"
              value={form.username}
              onChangeText={(v) => updateField("username", v)}
              error={errors.username}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Input
              label="Email (необязательно)"
              value={form.email}
              onChangeText={(v) => updateField("email", v)}
              error={errors.email}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Input
              label="Пароль"
              value={form.password}
              onChangeText={(v) => updateField("password", v)}
              error={errors.password}
              secureTextEntry
              autoCapitalize="none"
            />

            <Input
              label="Подтвердите пароль"
              value={form.confirmPassword}
              onChangeText={(v) => updateField("confirmPassword", v)}
              error={errors.confirmPassword}
              secureTextEntry
              autoCapitalize="none"
            />

            <Button
              label={isLoading ? "Регистрация..." : "Зарегистрироваться"}
              onPress={handleRegister}
              loading={isLoading}
              disabled={isLoading}
              style={styles.button}
            />
          </View>

          {/* Ссылка на вход */}
          <View style={styles.links}>
            <View style={styles.loginRow}>
              <Text style={styles.loginText}>Уже есть аккаунт? </Text>
              <Link href="/login" asChild>
                <Pressable>
                  <Text style={styles.link}>Войти</Text>
                </Pressable>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

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
    marginBottom: SPACING.xl,
  },
  title: {
    fontWeight: "bold",
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
  },
  loginRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  loginText: {
    color: COLORS.textSecondary,
  },
  link: {
    color: COLORS.primary,
    fontWeight: "600",
  },
});
