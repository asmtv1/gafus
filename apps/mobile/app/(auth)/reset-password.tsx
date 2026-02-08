import { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from "react-native";
import { Text, Snackbar } from "react-native-paper";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { z } from "zod";
import parsePhoneNumberFromString from "libphonenumber-js";

import { COLORS, SPACING, FONTS } from "@/constants";
import { authApi } from "@/shared/lib/api/auth";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Схемы валидации
const usernameSchema = z
  .string()
  .trim()
  .min(3, "минимум 3 символа")
  .max(50, "максимум 50 символов")
  .regex(/^[A-Za-z0-9_]+$/, "только английские буквы, цифры и _");

const phoneSchema = z
  .string()
  .trim()
  .min(1, "Номер телефона обязателен")
  .refine((value) => {
    const phone = parsePhoneNumberFromString(value, "RU");
    return !!phone && phone.isValid();
  }, "Неверный формат номера телефона");

/**
 * Страница сброса пароля - точное соответствие веб-версии
 */
export default function ResetPasswordScreen() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ username?: string; phone?: string }>({});
  const [status, setStatus] = useState("");
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

  const validateUsername = useCallback((): boolean => {
    const result = usernameSchema.safeParse(username);
    if (!result.success) {
      setErrors((prev) => ({ ...prev, username: result.error.errors[0].message }));
      return false;
    }
    setErrors((prev) => ({ ...prev, username: undefined }));
    return true;
  }, [username]);

  const validatePhone = useCallback((): boolean => {
    const result = phoneSchema.safeParse(phone);
    if (!result.success) {
      setErrors((prev) => ({ ...prev, phone: result.error.errors[0].message }));
      return false;
    }
    setErrors((prev) => ({ ...prev, phone: undefined }));
    return true;
  }, [phone]);

  const handleReset = async () => {
    // Валидация
    const isUsernameValid = validateUsername();
    const isPhoneValid = validatePhone();

    if (!isUsernameValid || !isPhoneValid) {
      return;
    }

    // Дополнительная валидация телефона через libphonenumber
    const phoneNumberObj = parsePhoneNumberFromString(phone, "RU");
    if (!phoneNumberObj?.isValid()) {
      setErrors((prev) => ({ ...prev, phone: "Неверный формат телефона" }));
      return;
    }

    setIsLoading(true);
    setStatus("");
    setErrors({});

    try {
      // Проверка совпадения телефона с логином
      const checkResult = await authApi.checkPhoneMatchesUsername(username, phone);

      if (!checkResult.success) {
        setErrors((prev) => ({
          ...prev,
          phone: checkResult.error || "Ошибка проверки данных",
        }));
        setIsLoading(false);
        return;
      }

      if (!checkResult.data?.matches) {
        setErrors((prev) => ({
          ...prev,
          phone: "Телефон не совпадает с именем пользователя",
        }));
        setIsLoading(false);
        return;
      }

      // Отправка запроса на сброс пароля
      const resetResult = await authApi.sendPasswordResetRequest(username, phone);

      if (!resetResult.success) {
        setSnackbar({
          visible: true,
          message: resetResult.error || "Ошибка отправки запроса",
        });
        setIsLoading(false);
        return;
      }

      setStatus("Если данные верны, вам придёт сообщение в Telegram");
    } catch (error) {
      setSnackbar({
        visible: true,
        message: "Ошибка отправки. Попробуйте позже.",
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
          {/* Декоративные лапки (только на мобильных) */}
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

          {/* Заголовок */}
          <Text style={styles.title}>Сброс пароля</Text>

          {/* Подзаголовок */}
          <Text style={styles.subtitle}>
            Введите логин и номер телефона для восстановления доступа.
          </Text>

          {/* Форма */}
          <View style={styles.form}>
            {/* Логин Input */}
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={(text) => {
                setUsername(text);
                if (errors.username) {
                  setErrors((prev) => ({ ...prev, username: undefined }));
                }
              }}
              placeholder="Логин"
              placeholderTextColor={COLORS.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
            />
            {errors.username && <Text style={styles.errorText}>{errors.username}</Text>}

            {/* Телефон Input */}
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={(text) => {
                setPhone(text);
                if (errors.phone) {
                  setErrors((prev) => ({ ...prev, phone: undefined }));
                }
              }}
              placeholder="+7XXXXXXXXXX"
              placeholderTextColor={COLORS.placeholder}
              keyboardType="phone-pad"
              autoComplete="tel"
            />
            {errors.phone && <Text style={styles.errorText}>{errors.phone}</Text>}

            {/* Кнопка восстановления */}
            <Pressable
              style={[styles.button, (isLoading || !username || !phone) && styles.buttonDisabled]}
              onPress={handleReset}
              disabled={isLoading || !username || !phone}
            >
              <Text style={styles.buttonText}>
                {isLoading ? "отправка..." : "восстановить пароль"}
              </Text>
            </Pressable>

            {/* Статус сообщение */}
            {status && <Text style={styles.status}>{status}</Text>}
          </View>

          {/* Логотип */}
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
    backgroundColor: COLORS.cardBackground, // #FFF8E5 как в веб
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
  // Декоративные лапки
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
  // Заголовок - Impact, 40px, цвет #636128
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
  // Подзаголовок - Montserrat, 12px, opacity 0.8
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
  // Форма
  form: {
    alignItems: "center",
    gap: 5,
    zIndex: 1,
  },
  // Инпуты - 250x29, border 2px #636128
  input: {
    backgroundColor: COLORS.cardBackground,
    width: 250,
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
    fontSize: 10,
    fontFamily: FONTS.montserrat,
    lineHeight: 12,
    marginTop: 4,
    color: COLORS.error,
    width: 250,
  },
  // Кнопка - 190x36, фон #636128, текст #dad3c1
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
  // Статус сообщение
  status: {
    color: "#636128",
    fontFamily: FONTS.montserrat,
    fontWeight: "400",
    fontSize: 14,
    lineHeight: 16.8,
    marginTop: 20,
    textAlign: "center",
    maxWidth: 300,
  },
  // Логотип - 307x224 как в веб (адаптивный для мобильных)
  logo: {
    width: 320,
    height: 320,
    zIndex: 1,
  },
  // Лапка внизу справа - 307x224, абсолютное позиционирование (адаптивный)
  bottomPaw: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: Math.min(307, SCREEN_WIDTH),
    height: Math.min(224, SCREEN_WIDTH * 0.73),
    zIndex: 0,
  },
});
