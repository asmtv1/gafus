import { useState, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  TextInput,
  Linking,
} from "react-native";
import { Text, Snackbar } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { z } from "zod";
import * as Crypto from "expo-crypto";
import { parsePhoneNumberFromString } from "libphonenumber-js";

import { useAuthStore } from "@/shared/stores";
import { useLayout } from "@/shared/hooks";
import { reportClientError } from "@/shared/lib/tracer";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { COLORS, SPACING, FONTS } from "@/constants";
import { CONSENT_DOCUMENT_URLS, type ConsentPayload } from "@/shared/constants/consent";

const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(3, "Минимум 3 символа")
      .max(50, "Максимум 50 символов")
      .regex(/^[a-zA-Z0-9_]+$/, "Только латиница, цифры и _"),
    phone: z
      .string()
      .min(1, "Введите номер телефона")
      .refine(
        (v) => {
          const p = parsePhoneNumberFromString(v, "RU");
          return p?.isValid() ?? false;
        },
        { message: "Введите корректный номер телефона" },
      ),
    password: z
      .string()
      .min(8, "Минимум 8 символов")
      .max(100, "Максимум 100 символов")
      .regex(/[A-Z]/, "Минимум одна заглавная буква")
      .regex(/[a-z]/, "Минимум одна строчная буква")
      .regex(/[0-9]/, "Минимум одна цифра"),
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
  consent?: string;
  /** Ошибка API (пользователь уже существует и т.п.) */
  api?: string;
};

/**
 * Страница регистрации
 */
export default function RegisterScreen() {
  const layout = useLayout();
  const { register } = useAuthStore();

  const formWidth = layout.contentWidth(SPACING.md * 4, 320);

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
  const [tempSessionId] = useState<string>(() => Crypto.randomUUID());
  const submittingRef = useRef(false);
  const [consents, setConsents] = useState({
    acceptPersonalData: false,
    acceptPrivacyPolicy: false,
    acceptDataDistribution: false,
  });

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const next = { ...prev, [field]: undefined, api: undefined };
      return next;
    });
  };

  const validateForm = useCallback((): boolean => {
    const result = registerSchema.safeParse(form);

    if (!result.success) {
      const fieldErrors: FormErrors = {};
      const validKeys: (keyof FormErrors)[] = [
        "name", "phone", "password", "confirmPassword", "consent",
      ];
      result.error.errors.forEach((err) => {
        const field = err.path[0];
        if (field != null && validKeys.includes(field as keyof FormErrors)) {
          fieldErrors[field as keyof FormErrors] = err.message;
        }
      });
      setErrors(fieldErrors);
      return false;
    }

    setErrors({});
    return true;
  }, [form]);

  const toggleConsent = (key: keyof typeof consents) => {
    setConsents((prev) => ({ ...prev, [key]: !prev[key] }));
    setErrors((prev) => ({ ...prev, consent: undefined, api: undefined }));
  };

  const handleRegister = async () => {
    if (submittingRef.current) return;
    if (!validateForm()) return;

    const allConsentsAccepted =
      consents.acceptPersonalData &&
      consents.acceptPrivacyPolicy &&
      consents.acceptDataDistribution;

    if (!allConsentsAccepted) {
      setErrors((prev) => ({ ...prev, consent: "Необходимо принять все согласия" }));
      return;
    }

    if (__DEV__) console.log("[Register] handleRegister start", { name: form.name, phone: form.phone, tempSessionId });
    submittingRef.current = true;
    setIsLoading(true);
    setErrors((prev) => ({ ...prev, api: undefined }));
    try {
      const normalizedName = form.name.toLowerCase().trim();
      const phoneNumber = parsePhoneNumberFromString(form.phone, "RU");
      if (!phoneNumber?.isValid()) {
        setErrors((prev) => ({ ...prev, phone: "Введите корректный номер телефона" }));
        return;
      }
      const formattedPhone = phoneNumber.format("E.164");

      const consentPayload: ConsentPayload = {
        acceptPersonalData: consents.acceptPersonalData,
        acceptPrivacyPolicy: consents.acceptPrivacyPolicy,
        acceptDataDistribution: consents.acceptDataDistribution,
      };

      const result = await register(
        normalizedName,
        formattedPhone,
        form.password,
        tempSessionId,
        consentPayload,
      );

      if (__DEV__) console.log("[Register] register result", result);

      if (result.success) {
        await hapticFeedback.success();
        setSnackbar({ visible: true, message: "Подтвердите номер в Telegram" });
        // Навигация на /confirm управляется AuthProvider (pendingConfirmPhone уже в store)
      } else {
        const msg = result.error || "Ошибка регистрации";
        setErrors((prev) => ({ ...prev, api: msg }));
        setSnackbar({ visible: true, message: msg });
      }
    } catch (err) {
      reportClientError(err instanceof Error ? err : new Error(String(err)), {
        issueKey: "RegisterScreen",
        keys: { operation: "register" },
      });
      if (__DEV__) console.error("[Register] handleRegister catch", err);
      const msg = "Ошибка подключения к серверу";
      setErrors((prev) => ({ ...prev, api: msg }));
      setSnackbar({ visible: true, message: msg });
    } finally {
      submittingRef.current = false;
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
          <Text
            style={[
              styles.title,
              { fontSize: Math.min(layout.moderateScale(100, 0.4), 100) },
            ]}
          >
            Гафус!
          </Text>

          {/* Контейнер с логотипом и подзаголовком */}
          <View style={styles.logoContainer}>
            <Image
              source={require("../../assets/images/register-logo.png")}
              style={[
                styles.logo,
                { width: formWidth, height: formWidth * 0.74 },
              ]}
              contentFit="contain"
            />
            <Text
              style={[
                styles.subtitle,
                { fontSize: Math.min(layout.moderateScale(40), 40) },
              ]}
            >
              регистрация
            </Text>
          </View>

          {/* Форма */}
          <View style={[styles.form, { width: formWidth }]}>
            {/* Name Input */}
            <TextInput
              style={[
                styles.input,
                { width: formWidth },
                Platform.OS === "android" && styles.inputAndroid,
              ]}
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
              style={[
                styles.input,
                { width: formWidth },
                Platform.OS === "android" && styles.inputAndroid,
              ]}
              value={form.phone}
              onChangeText={(v) => updateField("phone", v)}
              placeholder="+7XXXXXXXXXX"
              placeholderTextColor={COLORS.placeholder}
              keyboardType="phone-pad"
              autoCapitalize="none"
            />
            {errors.phone && <Text style={styles.errorText}>{errors.phone}</Text>}

            {/* Информация о подтверждении */}
            <View style={[styles.infoBlock, { width: formWidth }]}>
              <Text style={styles.info}>
                Требуется подтверждение номера через Telegram
              </Text>
            
            </View>

            {/* Password Input */}
            <View style={[styles.passwordInputWrapper, { width: formWidth }]}>
              <TextInput
                style={[
                  styles.inputWithIcon,
                  { width: formWidth },
                  Platform.OS === "android" && styles.inputAndroid,
                ]}
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
            <View style={[styles.passwordInputWrapper, { width: formWidth }]}>
              <TextInput
                style={[
                  styles.inputWithIcon,
                  { width: formWidth },
                  Platform.OS === "android" && styles.inputAndroid,
                ]}
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

            {/* Согласия */}
            <View style={[styles.consentsContainer, { width: formWidth }]}>
              <View style={styles.consentRow}>
                <Pressable
                  style={[styles.checkbox, consents.acceptPersonalData && styles.checkboxChecked]}
                  onPress={() => toggleConsent("acceptPersonalData")}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: consents.acceptPersonalData }}
                >
                  {consents.acceptPersonalData && (
                    <MaterialCommunityIcons
                      name="check"
                      size={14}
                      color={COLORS.cardBackground}
                    />
                  )}
                </Pressable>
                <Text style={styles.consentText}>
                  Даю согласие на{" "}
                  <Text
                    style={styles.consentLink}
                    onPress={() => Linking.openURL(CONSENT_DOCUMENT_URLS.personal)}
                  >
                    обработку персональных данных
                  </Text>
                </Text>
              </View>
              <View style={styles.consentRow}>
                <Pressable
                  style={[styles.checkbox, consents.acceptPrivacyPolicy && styles.checkboxChecked]}
                  onPress={() => toggleConsent("acceptPrivacyPolicy")}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: consents.acceptPrivacyPolicy }}
                >
                  {consents.acceptPrivacyPolicy && (
                    <MaterialCommunityIcons
                      name="check"
                      size={14}
                      color={COLORS.cardBackground}
                    />
                  )}
                </Pressable>
                <Text style={styles.consentText}>
                  Ознакомлен(а) с{" "}
                  <Text
                    style={styles.consentLink}
                    onPress={() => Linking.openURL(CONSENT_DOCUMENT_URLS.policy)}
                  >
                    Политикой конфиденциальности
                  </Text>
                </Text>
              </View>
              <View style={styles.consentRow}>
                <Pressable
                  style={[
                    styles.checkbox,
                    consents.acceptDataDistribution && styles.checkboxChecked,
                  ]}
                  onPress={() => toggleConsent("acceptDataDistribution")}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: consents.acceptDataDistribution }}
                >
                  {consents.acceptDataDistribution && (
                    <MaterialCommunityIcons
                      name="check"
                      size={14}
                      color={COLORS.cardBackground}
                    />
                  )}
                </Pressable>
                <Text style={styles.consentText}>
                  Даю согласие на{" "}
                  <Text
                    style={styles.consentLink}
                    onPress={() =>
                      Linking.openURL(CONSENT_DOCUMENT_URLS.dataDistribution)
                    }
                  >
                    размещение данных в публичном профиле
                  </Text>
                </Text>
              </View>
              {errors.consent && <Text style={styles.errorText}>{errors.consent}</Text>}
            </View>

            {errors.api && (
              <Text style={[styles.errorText, styles.apiError]}>{errors.api}</Text>
            )}

            {/* Кнопка регистрации */}
            <Pressable
              style={[
                styles.button,
                { width: formWidth },
                isLoading && styles.buttonDisabled,
              ]}
              onPress={handleRegister}
              disabled={isLoading}
            >
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
    paddingTop: 0,
    paddingBottom: 22,
    gap: 8,
  },
  // Заголовок "Гафус!" - fontSize задаётся динамически
  title: {
    fontWeight: "400",
    color: COLORS.primary,
    textAlign: "center",
    fontFamily: FONTS.impact,
    marginBottom: 5,
    marginTop: 0,

  },
  // Контейнер с логотипом и подзаголовком
  logoContainer: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  // Логотип - размеры задаются динамически
  logo: {},
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
  // Инпуты - border 2px #636128, width задаётся динамически
  input: {
    backgroundColor: COLORS.cardBackground,
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
  inputAndroid: {
    textAlignVertical: "center" as const,
    includeFontPadding: false,
  },
  passwordInputWrapper: {
    position: "relative",
  },
  inputWithIcon: {
    backgroundColor: COLORS.cardBackground,
    height: 29,
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
    fontSize: 9,
    fontFamily: FONTS.montserrat,
    marginTop: 4,
    color: COLORS.error,
  },
  apiError: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 11,
  },
  infoBlock: {
    gap: 4,
    paddingVertical: 8,
  },
  info: {
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
    fontWeight: "400",
    fontSize: 10,
    textAlign: "center",
    lineHeight: 14,
  },
  infoLink: {
    color: COLORS.secondary,
    textDecorationLine: "underline",
  },
  consentsContainer: {
    gap: 8,
    marginTop: 8,
  },
  consentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 2,
    borderColor: "#636128",
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  consentText: {
    flex: 1,
    minWidth: 0,
    fontSize: 9,
    fontFamily: FONTS.montserrat,
    color: COLORS.primary,
    lineHeight: 13,
  },
  consentLink: {
    textDecorationLine: "underline",
    color: COLORS.primary,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  // Кнопка регистрации - width задаётся динамически, стиль как welcome
  button: {
    backgroundColor: COLORS.primary,
    height: 48,
    borderRadius: 8,
    marginTop: 20,
    borderWidth: 2,
    borderColor: COLORS.cardBackground,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonText: {
    fontFamily: FONTS.impact,
    fontWeight: "400",
    fontSize: 22,
    color: COLORS.onPrimary,
    textAlign: "center",
  },
});
