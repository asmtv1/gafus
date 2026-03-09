import { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  TextInput,
} from "react-native";
import { Text, Snackbar } from "react-native-paper";
import { Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { z } from "zod";

import { useAuthStore } from "@/shared/stores";
import { useLayout } from "@/shared/hooks";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { COLORS, SPACING, FONTS } from "@/constants";

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
  const layout = useLayout();
  const { login } = useAuthStore();

  const formWidth = layout.contentWidth(SPACING.md * 4, 280);
  const logoSize = Math.min(layout.scale(303), layout.contentWidth(SPACING.md * 4));

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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

    if (__DEV__) console.log("[Login] handleLogin start", { username });
    setIsLoading(true);
    try {
      const result = await login(username, password);
      if (__DEV__) console.log("[Login] login result", result);

      if (result.success) {
        await hapticFeedback.success();
      } else {
        setSnackbar({
          visible: true,
          message: result.error || "Ошибка авторизации",
        });
      }
      // Навигация управляется AuthProvider на основе isAuthenticated / pendingConfirmPhone
    } catch (err) {
      if (__DEV__) console.error("[Login] handleLogin catch", err);
      setSnackbar({
        visible: true,
        message: "Ошибка подключения к серверу",
      });
    } finally {
      setIsLoading(false);
      if (__DEV__) {
        const state = useAuthStore.getState();
        console.log("[Login] after login state", {
          isAuthenticated: state.isAuthenticated,
          pendingConfirmPhone: state.pendingConfirmPhone,
          userId: state.user?.id,
        });
      }
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
          <Text
            style={[
              styles.title,
              { fontSize: Math.min(layout.moderateScale(100, 0.4), 100) },
            ]}
          >
            Гафус!
          </Text>

          {/* Логотип */}
          <Image
            source={require("../../assets/images/login.png")}
            style={[styles.logo, { width: logoSize, height: logoSize }]}
            contentFit="contain"
          />

          {/* Подзаголовок */}
          <Text
            style={[
              styles.subtitle,
              { fontSize: layout.moderateScale(40), maxWidth: layout.scale(320) },
            ]}
          >
            Авторизация
          </Text>

          {/* Текст с ссылкой на регистрацию */}
          <View style={[styles.registerTextContainer, { maxWidth: layout.scale(320) }]}>
            <Text style={styles.registerPrompt}>
              Если у Вас еще нет аккаунта -
              <Link href="/register">
                <Text style={styles.registerLink}>зарегистрируйтесь</Text>
              </Link>
              .
            </Text>
          </View>

          {/* Форма */}
          <View style={[styles.form, { width: formWidth }]}>
            {/* Username Input */}
            <TextInput
              style={[
                styles.input,
                { width: formWidth, height: layout.scale(29) },
                Platform.OS === "android" && styles.inputAndroid,
              ]}
              value={username}
              onChangeText={(v) => {
                setUsername(v);
                if (errors.username) setErrors((prev) => ({ ...prev, username: undefined }));
              }}
              placeholder="Имя пользователя"
              placeholderTextColor={COLORS.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              testID="username-input"
            />
            {errors.username && <Text style={styles.errorText}>{errors.username}</Text>}

            {/* Password Input */}
            <View style={[styles.passwordInputWrapper, { width: formWidth }]}>
              <TextInput
                style={[
                  styles.inputWithIcon,
                  { width: formWidth, height: layout.scale(29) },
                  Platform.OS === "android" && styles.inputAndroid,
                ]}
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                }}
                placeholder="Пароль"
                placeholderTextColor={COLORS.placeholder}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="password"
                testID="password-input"
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

            {/* Кнопки: Регистрация и Забыли пароль */}
            <View style={[styles.buttonsContainer, { width: formWidth }]}>
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
              style={[
                styles.submitButton,
                {
                  width: layout.scale(150),
                  height: layout.scale(150),
                },
              ]}
              onPress={handleLogin}
              disabled={isLoading}
              testID="login-button"
            >
              {isLoading ? (
                <Text style={styles.submitButtonText}>Загрузка...</Text>
              ) : (
                <Image
                  source={require("../../assets/images/login-paw.png")}
                  style={[
                    styles.submitButtonImage,
                    {
                      width: layout.scale(120),
                      height: layout.scale(125),
                    },
                  ]}
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
    paddingTop: 0,
    paddingBottom: SPACING.md,
    gap: 10,
  },
  title: {
    fontWeight: "400",
    color: COLORS.primary,
    textAlign: "center",
    fontFamily: FONTS.impact,
  },
  logo: {},
  subtitle: {
    fontWeight: "400",
    color: COLORS.primary,
    textAlign: "left",
    fontFamily: FONTS.impact,
    marginTop: -SPACING.xl,
  },
  registerTextContainer: {},
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
  input: {
    backgroundColor: COLORS.cardBackground,
    borderWidth: 2,
    borderColor: "#636128",
    borderRadius: 5,
    paddingLeft: 10,
    paddingVertical: 0,
    fontSize: 12,
    fontFamily: FONTS.montserrat,
    color: COLORS.primary,
  },
  inputAndroid: {
    textAlignVertical: "center" as const,
    includeFontPadding: false,
  },
  passwordInputWrapper: {
    position: "relative",
  },
  inputWithIcon: {
    backgroundColor: COLORS.cardBackground,
    borderWidth: 2,
    borderColor: "#636128",
    borderRadius: 5,
    paddingLeft: 10,
    paddingRight: 40,
    paddingVertical: 0,
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
    fontSize: 12,
    fontFamily: FONTS.montserrat,
    lineHeight: 14,
    marginTop: 4,
    color: COLORS.error,
  },
  buttonsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 5,
  },
  // Кнопки-ссылки (Регистрация, Забыли пароль)
  linkButton: {
    fontSize: 10,
    fontFamily: FONTS.montserrat,
    color: COLORS.primary,
  },
  submitButton: {
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 5,
  },
  submitButtonImage: {},
  submitButtonText: {
    fontSize: 25,
    fontWeight: "400",
    color: COLORS.primary,
    fontFamily: FONTS.impact,
  },
});
