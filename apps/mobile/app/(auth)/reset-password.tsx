import { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Text, Snackbar } from "react-native-paper";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { z } from "zod";

import { COLORS, SPACING, FONTS } from "@/constants";
import { authApi } from "@/shared/lib/api/auth";
import { reportClientError } from "@/shared/lib/tracer";
import { hapticFeedback } from "@/shared/lib/utils/haptics";

const emailSchema = z.string().trim().email("Укажите корректный email");

const tokenSchema = z
  .string()
  .trim()
  .min(32, "Вставьте токен из ссылки в письме")
  .max(128, "Некорректная длина токена");

const passwordSchema = z
  .string()
  .min(8, "Минимум 8 символов")
  .max(100, "Максимум 100 символов")
  .regex(/[A-Z]/, "Минимум одна заглавная буква")
  .regex(/[a-z]/, "Минимум одна строчная буква")
  .regex(/[0-9]/, "Минимум одна цифра");

/**
 * Сброс пароля: запрос письма на email, затем токен из ссылки и новый пароль
 */
export default function ResetPasswordScreen() {
  const router = useRouter();

  const [phase, setPhase] = useState<"request" | "token">("request");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{
    email?: string;
    token?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const validateEmail = useCallback((): boolean => {
    const result = emailSchema.safeParse(email);
    if (!result.success) {
      setErrors((prev) => ({ ...prev, email: result.error.errors[0].message }));
      return false;
    }
    setErrors((prev) => ({ ...prev, email: undefined }));
    return true;
  }, [email]);

  const validateToken = useCallback((): boolean => {
    const result = tokenSchema.safeParse(token);
    if (!result.success) {
      setErrors((prev) => ({ ...prev, token: result.error.errors[0].message }));
      return false;
    }
    setErrors((prev) => ({ ...prev, token: undefined }));
    return true;
  }, [token]);

  const validatePassword = useCallback((): boolean => {
    const result = passwordSchema.safeParse(password);
    if (!result.success) {
      setErrors((prev) => ({ ...prev, password: result.error.errors[0].message }));
      return false;
    }
    setErrors((prev) => ({ ...prev, password: undefined }));
    return true;
  }, [password]);

  const handleRequestEmail = async () => {
    if (!validateEmail()) return;

    setIsLoading(true);
    setErrors({});

    try {
      const resetResult = await authApi.sendPasswordResetRequest(email);

      if (!resetResult.success) {
        setSnackbar({
          visible: true,
          message: resetResult.error || "Ошибка отправки запроса",
        });
        return;
      }

      await hapticFeedback.success();
      setSnackbar({
        visible: true,
        message: "Если аккаунт есть, на email отправлено письмо со ссылкой.",
      });
      setPhase("token");
    } catch (err) {
      reportClientError(err, { issueKey: "ResetPassword", keys: { operation: "send_reset_request" } });
      setSnackbar({
        visible: true,
        message: "Ошибка отправки. Попробуйте позже.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    const isTokenValid = validateToken();
    const isPasswordValid = validatePassword();

    if (password !== confirmPassword) {
      setErrors((prev) => ({
        ...prev,
        confirmPassword: "Пароли не совпадают",
      }));
      return;
    }
    setErrors((prev) => ({ ...prev, confirmPassword: undefined }));

    if (!isTokenValid || !isPasswordValid) return;

    setIsLoading(true);
    setErrors({});

    try {
      const result = await authApi.resetPasswordByToken(token.trim(), password);

      if (!result.success) {
        setSnackbar({
          visible: true,
          message: result.error || "Не удалось сбросить пароль",
        });
        return;
      }

      await hapticFeedback.success();
      setSnackbar({
        visible: true,
        message: "Пароль изменён. Войдите с новым паролем.",
      });
      router.replace("/login");
    } catch (err) {
      reportClientError(err, { issueKey: "ResetPassword", keys: { operation: "reset_by_token" } });
      setSnackbar({
        visible: true,
        message: "Ошибка. Попробуйте позже.",
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
          <View style={styles.pawsContainer}>
            <Image
              source={require("../../assets/images/paw.png")}
              style={[styles.paw, styles.paw1]}
              contentFit="contain"
            />
            <Image
              source={require("../../assets/images/paw.png")}
              style={[styles.paw, styles.paw2]}
              contentFit="contain"
            />
            <Image
              source={require("../../assets/images/paw.png")}
              style={[styles.paw, styles.paw3]}
              contentFit="contain"
            />
            <Image
              source={require("../../assets/images/paw.png")}
              style={[styles.paw, styles.paw4]}
              contentFit="contain"
            />
          </View>

          <Text style={styles.title}>Сброс пароля</Text>

          <Text style={styles.subtitle}>
            {phase === "request"
              ? "Укажите email аккаунта — пришлём письмо со ссылкой."
              : "Скопируйте токен из ссылки в письме (часть после token=) и задайте новый пароль."}
          </Text>

          {phase === "request" && (
            <View style={styles.form}>
              <TextInput
                style={[styles.input, Platform.OS === "android" && styles.inputAndroid]}
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (errors.email) {
                    setErrors((prev) => ({ ...prev, email: undefined }));
                  }
                }}
                placeholder="Email"
                placeholderTextColor={COLORS.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
              />
              {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}

              <Pressable
                style={[styles.button, (isLoading || !email.trim()) && styles.buttonDisabled]}
                onPress={handleRequestEmail}
                disabled={isLoading || !email.trim()}
              >
                <Text style={styles.buttonText}>
                  {isLoading ? "отправка..." : "отправить письмо"}
                </Text>
              </Pressable>
            </View>
          )}

          {phase === "token" && (
            <View style={styles.form}>
              <TextInput
                style={[styles.inputWide, Platform.OS === "android" && styles.inputAndroid]}
                value={token}
                onChangeText={(text) => {
                  setToken(text);
                  if (errors.token) setErrors((prev) => ({ ...prev, token: undefined }));
                }}
                placeholder="Токен из ссылки"
                placeholderTextColor={COLORS.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {errors.token && <Text style={styles.errorText}>{errors.token}</Text>}

              <View style={styles.passwordInputWrapper}>
                <TextInput
                  style={[
                    styles.input,
                    styles.inputWithIcon,
                    Platform.OS === "android" && styles.inputAndroid,
                  ]}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  placeholder="Новый пароль"
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

              <View style={styles.passwordInputWrapper}>
                <TextInput
                  style={[
                    styles.input,
                    styles.inputWithIcon,
                    Platform.OS === "android" && styles.inputAndroid,
                  ]}
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    if (errors.confirmPassword)
                      setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                  }}
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

              <Pressable
                style={[
                  styles.button,
                  (isLoading || !token.trim() || !password || !confirmPassword) &&
                    styles.buttonDisabled,
                ]}
                onPress={handleResetPassword}
                disabled={isLoading || !token.trim() || !password || !confirmPassword}
              >
                <Text style={styles.buttonText}>
                  {isLoading ? "сохранение..." : "сохранить пароль"}
                </Text>
              </Pressable>

              <Pressable
                style={[styles.linkBack, isLoading && styles.buttonDisabled]}
                onPress={() => setPhase("request")}
                disabled={isLoading}
              >
                <Text style={styles.linkBackText}>← Другой email</Text>
              </Pressable>
            </View>
          )}

          <Image
            source={require("../../assets/images/passwordReset-logo.png")}
            style={styles.logo}
            contentFit="contain"
          />
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
    backgroundColor: COLORS.cardBackground,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm + 40,
    paddingBottom: SPACING.md,
    gap: 14,
    position: "relative",
  },
  pawsContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 200,
    zIndex: 0,
  },
  paw: {
    position: "absolute",
    width: 87,
    height: 84,
  },
  paw1: {
    top: 32,
    left: 2,
    transform: [{ rotate: "35deg" }],
  },
  paw2: {
    top: 64,
    left: 98,
    transform: [{ rotate: "35deg" }],
  },
  paw3: {
    top: 0,
    left: 194,
    transform: [{ rotate: "35deg" }],
  },
  paw4: {
    top: 48,
    left: 290,
    transform: [{ rotate: "32deg" }],
  },
  title: {
    color: COLORS.primary,
    fontFamily: FONTS.impact,
    fontWeight: "400",
    fontSize: 40,
    lineHeight: 40,
    textAlign: "center",
    marginTop: 176,
    marginBottom: 8,
    zIndex: 1,
  },
  subtitle: {
    color: COLORS.primary,
    fontFamily: FONTS.montserrat,
    opacity: 0.8,
    fontSize: 12,
    lineHeight: 15.6,
    textAlign: "center",
    maxWidth: 320,
    zIndex: 1,
  },
  form: {
    alignItems: "center",
    gap: 5,
    zIndex: 1,
  },
  input: {
    backgroundColor: COLORS.cardBackground,
    width: 250,
    height: 29,
    borderWidth: 2,
    borderColor: "#636128",
    borderRadius: 5,
    paddingLeft: 10,
    paddingVertical: 0,
    fontSize: 12,
    fontFamily: FONTS.montserrat,
    color: COLORS.primary,
  },
  inputWide: {
    backgroundColor: COLORS.cardBackground,
    width: 300,
    minHeight: 36,
    borderWidth: 2,
    borderColor: "#636128",
    borderRadius: 5,
    paddingLeft: 10,
    paddingVertical: 6,
    fontSize: 11,
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
    paddingRight: 40,
  },
  eyeButton: {
    position: "absolute",
    right: 8,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  errorText: {
    fontSize: 10,
    fontFamily: FONTS.montserrat,
    lineHeight: 12,
    marginTop: 4,
    color: COLORS.error,
    width: 250,
  },
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
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontFamily: FONTS.montserrat,
    fontWeight: "600",
    fontSize: 10,
    lineHeight: 10,
    color: "#dad3c1",
  },
  linkBack: {
    marginTop: 16,
    padding: 8,
  },
  linkBackText: {
    fontFamily: FONTS.montserrat,
    fontSize: 12,
    color: COLORS.primary,
    textDecorationLine: "underline",
  },
  logo: {
    width: 320,
    height: 320,
    zIndex: 1,
  },
});
