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
import { z } from "zod";

import { useAuthStore } from "@/shared/stores";
import { COLORS, SPACING, FONTS } from "@/constants";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

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
          message: result.error || "Ошибка авторизации",
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

          {/* Логотип */}
          <Image
            source={require("../../assets/images/login.png")}
            style={styles.logo}
            contentFit="contain"
          />

          {/* Подзаголовок */}
          <Text style={styles.subtitle}>Авторизация</Text>

          {/* Текст с ссылкой на регистрацию */}
          <View style={styles.registerTextContainer}>
            <Text style={styles.registerPrompt}>
              Если у Вас еще нет аккаунта -
              <Link href="/register">
                <Text style={styles.registerLink}>зарегистрируйтесь</Text>
              </Link>
              .
            </Text>
          </View>

          {/* Форма */}
          <View style={styles.form}>
            {/* Username Input */}
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="Имя пользователя"
              placeholderTextColor={COLORS.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              testID="username-input"
            />
            {errors.username && <Text style={styles.errorText}>{errors.username}</Text>}

            {/* Password Input */}
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Пароль"
              placeholderTextColor={COLORS.placeholder}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
              testID="password-input"
            />
            {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}

            {/* Кнопки: Регистрация и Забыли пароль */}
            <View style={styles.buttonsContainer}>
              <Link href="/register" asChild>
                <Pressable>
                  <Text style={styles.linkButton}>Регистрация</Text>
                </Pressable>
              </Link>

              <Link href="/reset-password" asChild>
                <Pressable>
                  <Text style={styles.linkButton}>Забыли пароль?</Text>
                </Pressable>
              </Link>
            </View>

            {/* Кнопка входа */}
            <Pressable
              style={styles.submitButton}
              onPress={handleLogin}
              disabled={isLoading}
              testID="login-button"
            >
              {isLoading ? (
                <Text style={styles.submitButtonText}>Загрузка...</Text>
              ) : (
                <Image
                  source={require("../../assets/images/login-paw.png")}
                  style={styles.submitButtonImage}
                  contentFit="contain"
                />
              )}
            </Pressable>
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
    paddingBottom: SPACING.md,
    gap: 10,
  },
  // Заголовок "Гафус!" - как в веб (Impact, 110px)
  title: {
    fontSize: Math.min(100, SCREEN_WIDTH * 0.28),
    fontWeight: "400",
    color: COLORS.primary,
    textAlign: "center",
    fontFamily: FONTS.impact,
  },
  // Логотип - 303x303 как в веб
  logo: {
    width: Math.min(303, SCREEN_WIDTH * 0.8),
    height: Math.min(303, SCREEN_WIDTH * 0.8),
  },
  // Подзаголовок "Авторизация" - Impact, 40px
  subtitle: {
    fontSize: 40,
    fontWeight: "400",
    color: COLORS.primary,
    textAlign: "left",
    maxWidth: 320,
    fontFamily: FONTS.impact,
  },
  // Контейнер текста с ссылкой
  registerTextContainer: {
    maxWidth: 320,
  },
  // Текст "Если у Вас еще нет аккаунта"
  registerPrompt: {
    fontSize: 10,
    fontWeight: "400",
    color: COLORS.primary,
    fontFamily: FONTS.montserrat,
    textAlign: "left",
  },
  // Ссылка "зарегистрируйтесь"
  registerLink: {
    fontSize: 10,
    color: COLORS.primary,
    textDecorationLine: "underline",
    fontFamily: FONTS.montserrat,
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
  // Текст ошибки
  errorText: {
    fontSize: 12,
    fontFamily: FONTS.montserrat,
    lineHeight: 14,
    marginTop: 4,
    color: COLORS.error,
  },
  // Контейнер кнопок-ссылок
  buttonsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 250,
    marginTop: 5,
  },
  // Кнопки-ссылки (Регистрация, Забыли пароль)
  linkButton: {
    fontSize: 10,
    fontFamily: FONTS.montserrat,
    color: COLORS.primary,
  },
  // Кнопка входа
  submitButton: {
    backgroundColor: "transparent",
    width: 150,
    height: 150,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 5,
  },
  submitButtonImage: {
    width: 120,
    height: 125,
  },
  submitButtonText: {
    fontSize: 25,
    fontWeight: "400",
    color: COLORS.primary,
    fontFamily: FONTS.impact,
  },
});
