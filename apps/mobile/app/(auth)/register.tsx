import { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  TextInput,
  Dimensions,
} from "react-native";
import { Text, Snackbar } from "react-native-paper";
import { Link, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { z } from "zod";

import { useAuthStore } from "@/shared/stores";
import { COLORS, SPACING, FONTS } from "@/constants";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Схема валидации
const registerSchema = z
  .object({
    name: z
      .string()
      .min(3, "Минимум 3 символа")
      .max(50, "Максимум 50 символов")
      .regex(/^[a-zA-Z0-9_]+$/, "Только латиница, цифры и _"),
    phone: z.string().min(10, "Введите корректный номер телефона"),
    password: z.string().min(6, "Минимум 6 символов"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Пароли не совпадают",
    path: ["confirmPassword"],
  });

type FormErrors = {
  name?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
};

/**
 * Страница регистрации
 */
export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuthStore();

  const [form, setForm] = useState({
    name: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
      const result = await register(form.name, form.phone, form.password);

      if (result.success) {
        setSnackbar({
          visible: true,
          message: "Регистрация успешна! Выполняется вход...",
        });

        // Автоматический переход на главную после успешной регистрации
        setTimeout(() => {
          router.replace("/");
        }, 1500);
      } else {
        setSnackbar({
          visible: true,
          message: result.error || "Ошибка регистрации",
        });
      }
    } catch (error) {
      setSnackbar({
        visible: true,
        message: "Ошибка подключения к серверу",
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
          <Text style={styles.title}>Гафус!</Text>

          {/* Контейнер с логотипом и подзаголовком */}
          <View style={styles.logoContainer}>
            <Image
              source={require("../../assets/images/register-logo.png")}
              style={styles.logo}
              contentFit="contain"
            />
            <Text style={styles.subtitle}>регистрация</Text>
          </View>

          {/* Форма */}
          <View style={styles.form}>
            {/* Name Input */}
            <TextInput
              style={styles.input}
              value={form.name}
              onChangeText={(v) => updateField("name", v)}
              placeholder="Имя пользователя"
              placeholderTextColor={COLORS.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}

            {/* Phone Input */}
            <TextInput
              style={styles.input}
              value={form.phone}
              onChangeText={(v) => updateField("phone", v)}
              placeholder="+7XXXXXXXXXX"
              placeholderTextColor={COLORS.placeholder}
              keyboardType="phone-pad"
              autoCapitalize="none"
            />
            {errors.phone && <Text style={styles.errorText}>{errors.phone}</Text>}

            {/* Информация о подтверждении */}
            <Text style={styles.info}>Требуется Подтверждение через Telegram</Text>

            {/* Password Input */}
            <View style={styles.passwordInputWrapper}>
              <TextInput
                style={styles.inputWithIcon}
                value={form.password}
                onChangeText={(v) => updateField("password", v)}
                placeholder="Пароль"
                placeholderTextColor={COLORS.placeholder}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <Pressable
                style={styles.eyeButton}
                onPress={() => setShowPassword((v) => !v)}
                accessibilityLabel={showPassword ? "Скрыть пароль" : "Показать пароль"}
              >
                <MaterialCommunityIcons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={22}
                  color={COLORS.primary}
                />
              </Pressable>
            </View>
            {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}

            {/* Confirm Password Input */}
            <View style={styles.passwordInputWrapper}>
              <TextInput
                style={styles.inputWithIcon}
                value={form.confirmPassword}
                onChangeText={(v) => updateField("confirmPassword", v)}
                placeholder="Повторите пароль"
                placeholderTextColor={COLORS.placeholder}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
              />
              <Pressable
                style={styles.eyeButton}
                onPress={() => setShowConfirmPassword((v) => !v)}
                accessibilityLabel={
                  showConfirmPassword ? "Скрыть пароль" : "Показать пароль"
                }
              >
                <MaterialCommunityIcons
                  name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                  size={22}
                  color={COLORS.primary}
                />
              </Pressable>
            </View>
            {errors.confirmPassword && (
              <Text style={styles.errorText}>{errors.confirmPassword}</Text>
            )}

            {/* Кнопка регистрации */}
            <Pressable style={styles.button} onPress={handleRegister} disabled={isLoading}>
              <Text style={styles.buttonText}>
                {isLoading ? "регистрация..." : "зарегистрироваться"}
              </Text>
            </Pressable>
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
    backgroundColor: COLORS.cardBackground, // #FFF8E5 как в веб
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: 22,
    gap: 16,
  },
  // Заголовок "Гафус!" - как в веб (Impact, 110px)
  title: {
    fontSize: Math.min(100, SCREEN_WIDTH * 0.28),
    fontWeight: "400",
    color: COLORS.primary,
    textAlign: "center",
    fontFamily: FONTS.impact,
    marginBottom: SPACING.sm,
  },
  // Контейнер с логотипом и подзаголовком
  logoContainer: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  // Логотип - 277x204
  logo: {
    width: Math.min(277, SCREEN_WIDTH * 0.7),
    height: Math.min(204, SCREEN_WIDTH * 0.52),
  },
  // Подзаголовок "регистрация" - Impact, 40px
  subtitle: {
    fontSize: 40,
    fontWeight: "400",
    color: COLORS.primary,
    textAlign: "center",
    fontFamily: FONTS.impact,
  },
  // Форма
  form: {
    alignItems: "center",
    gap: 5,
  },
  // Инпуты - 250x29, border 2px #636128
  input: {
    backgroundColor: COLORS.cardBackground,
    width: 230,
    height: 29,
    borderWidth: 2,
    borderColor: "#636128",
    borderRadius: 5,
    paddingLeft: 10,
    fontSize: 12,
    fontFamily: FONTS.montserrat,
    color: COLORS.primary,
  },
  passwordInputWrapper: {
    position: "relative",
    width: 230,
  },
  inputWithIcon: {
    backgroundColor: COLORS.cardBackground,
    width: 230,
    height: 29,
    borderWidth: 2,
    borderColor: "#636128",
    borderRadius: 5,
    paddingLeft: 10,
    paddingRight: 40,
    fontSize: 12,
    fontFamily: FONTS.montserrat,
    color: COLORS.primary,
  },
  eyeButton: {
    position: "absolute",
    right: 8,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  // Текст ошибки
  errorText: {
    fontSize: 9,
    fontFamily: FONTS.montserrat,
    marginTop: 4,
    color: COLORS.error,
  },
  // Информация о подтверждении через Telegram
  info: {
    color: "black",
    fontFamily: FONTS.montserrat,
    fontStyle: "italic",
    fontWeight: "400",
    fontSize: 10,
    paddingVertical: 10,
    textAlign: "center",
  },
  // Кнопка регистрации
  button: {
    backgroundColor: COLORS.primary,
    width: 190,
    height: 36,
    borderRadius: 5,
    marginTop: 30,
    borderWidth: 2,
    borderColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  buttonText: {
    fontFamily: FONTS.impact,
    fontWeight: "400",
    fontSize: 20,
    color: "#dad3c1",
    textAlign: "center",
  },
});
