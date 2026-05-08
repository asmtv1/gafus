import { useState, useCallback, useRef, useEffect } from "react";
import { usePathname } from "expo-router";
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
import { coreRegisterEmailSchema } from "@gafus/core/validation/auth-register";
import { suggestRegisterEmailDomain } from "@gafus/core/validation/email-domain-suggestion";
import * as Crypto from "expo-crypto";
import { trackEvent } from "@/shared/lib/analytics";
import { useAuthStore } from "@/shared/stores";
import { useLayout } from "@/shared/hooks";
import { getOtaRuntimeFingerprintText } from "@/shared/lib/otaRuntimeFingerprint";
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
    email: coreRegisterEmailSchema,
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

const CONSENT_ALL_REQUIRED_MESSAGE =
  "Для регистрации нужно отметить все три согласия — поставьте галочки во всех пунктах.";

type FormErrors = {
  name?: string;
  email?: string;
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
  const pathname = usePathname() ?? "/register";
  const register = useAuthStore((s) => s.register);

  const formWidth = layout.contentWidth(SPACING.md * 4, 320);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });
  const [tempSessionId] = useState<string>(() => Crypto.randomUUID());
  const [emailTypoFull, setEmailTypoFull] = useState<string | null>(null);
  /** Актуальный email для blur/onEndEditing (state в RN может отставать от события). */
  const emailTextRef = useRef("");
  const submittingRef = useRef(false);
  const [consents, setConsents] = useState({
    acceptPersonalData: false,
    acceptPrivacyPolicy: false,
    acceptDataDistribution: false,
  });

  const applyEmailTypoHint = useCallback((raw: string) => {
    try {
      const s = suggestRegisterEmailDomain(raw);
      setEmailTypoFull(s?.full ?? null);
    } catch (err) {
      setEmailTypoFull(null);
      reportClientError(err instanceof Error ? err : new Error(String(err)), {
        issueKey: "RegisterScreen",
        keys: { operation: "email_typo_hint" },
      });
    }
  }, []);

  const emailTypoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Android: onBlur/onEndEditing часто не вызываются при переносе фокуса на кнопку/другое поле.
   * Пересчёт подсказки после паузы в вводе — основной надёжный триггер на обеих платформах.
   */
  useEffect(() => {
    const raw = form.email;
    if (emailTypoDebounceRef.current) {
      clearTimeout(emailTypoDebounceRef.current);
    }
    if (!raw.includes("@")) {
      setEmailTypoFull(null);
      return;
    }
    emailTypoDebounceRef.current = setTimeout(() => {
      applyEmailTypoHint(raw);
    }, 550);
    return () => {
      if (emailTypoDebounceRef.current) {
        clearTimeout(emailTypoDebounceRef.current);
      }
    };
  }, [form.email, applyEmailTypoHint]);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === "email") {
      emailTextRef.current = value;
      setEmailTypoFull(null);
    }
    setErrors((prev) => {
      const next = { ...prev, [field]: undefined, api: undefined };
      return next;
    });
  };

  /**
   * Поля и согласия проверяем за один раз: иначе при ошибках ввода выходили раньше
   * и сообщение про галочки никогда не показывалось.
   */
  const validateRegisterForm = useCallback((): boolean => {
    const next: FormErrors = {};
    const parseResult = registerSchema.safeParse(form);

    if (!parseResult.success) {
      const validKeys: (keyof FormErrors)[] = [
        "name",
        "email",
        "password",
        "confirmPassword",
        "consent",
      ];
      parseResult.error.errors.forEach((err) => {
        const field = err.path[0];
        if (field != null && validKeys.includes(field as keyof FormErrors)) {
          next[field as keyof FormErrors] = err.message;
        }
      });
    }

    const allConsentsAccepted =
      consents.acceptPersonalData &&
      consents.acceptPrivacyPolicy &&
      consents.acceptDataDistribution;

    if (!allConsentsAccepted) {
      next.consent = CONSENT_ALL_REQUIRED_MESSAGE;
    }

    if (Object.keys(next).length > 0) {
      setErrors({ ...next, api: undefined });
      return false;
    }

    setErrors({});
    return true;
  }, [form, consents]);

  const toggleConsent = (key: keyof typeof consents) => {
    setConsents((prev) => ({ ...prev, [key]: !prev[key] }));
    setErrors((prev) => ({ ...prev, consent: undefined, api: undefined }));
  };

  const handleRegister = async () => {
    if (submittingRef.current) return;
    applyEmailTypoHint(emailTextRef.current || form.email);
    if (!validateRegisterForm()) return;

    trackEvent({
      eventName: "button_click",
      platform: "mobile",
      pathOrScreen: pathname,
      elementId: "cta-register-submit",
    });

    if (__DEV__) console.log("[Register] handleRegister start", { name: form.name, email: form.email, tempSessionId });
    submittingRef.current = true;
    setIsLoading(true);
    setErrors((prev) => ({ ...prev, api: undefined }));
    try {
      const normalizedName = form.name.toLowerCase().trim();
      const normalizedEmail = form.email.trim().toLowerCase();

      const consentPayload: ConsentPayload = {
        acceptPersonalData: consents.acceptPersonalData,
        acceptPrivacyPolicy: consents.acceptPrivacyPolicy,
        acceptDataDistribution: consents.acceptDataDistribution,
      };

      const result = await register(
        normalizedName,
        normalizedEmail,
        form.password,
        tempSessionId,
        consentPayload,
      );

      if (__DEV__) console.log("[Register] register result", result);

      if (result.success) {
        trackEvent({
          eventName: "register_success",
          platform: "mobile",
          pathOrScreen: pathname,
          flow: "email",
        });
        await hapticFeedback.success();
        setSnackbar({ visible: true, message: "Регистрация успешна" });
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
                { width: formWidth * 0.8, height: formWidth * 0.8 * 0.74 },
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

            {/* Email */}
            <TextInput
              style={[
                styles.input,
                { width: formWidth },
                Platform.OS === "android" && styles.inputAndroid,
              ]}
              value={form.email}
              onChangeText={(v) => updateField("email", v)}
              onEndEditing={(e) => {
                applyEmailTypoHint(e.nativeEvent.text);
              }}
              onBlur={() => {
                applyEmailTypoHint(emailTextRef.current);
              }}
              onSubmitEditing={() => {
                applyEmailTypoHint(emailTextRef.current);
              }}
              returnKeyType="next"
              placeholder="email@example.com"
              placeholderTextColor={COLORS.placeholder}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
            {emailTypoFull && (
              <View style={[styles.emailTypoHint, { width: formWidth }]}>
                <Text style={styles.emailTypoHintText}>
                  Возможно, имелось в виду {emailTypoFull}?
                </Text>
                <Pressable
                  style={styles.emailTypoFix}
                  onPress={() => updateField("email", emailTypoFull)}
                  accessibilityRole="button"
                  accessibilityLabel="Исправить email на предложенный"
                >
                  <Text style={styles.emailTypoFixText}>Исправить</Text>
                </Pressable>
              </View>
            )}

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
                  style={styles.checkboxHit}
                  onPress={() => toggleConsent("acceptPersonalData")}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: consents.acceptPersonalData }}
                >
                  <View
                    style={[
                      styles.checkboxBox,
                      consents.acceptPersonalData && styles.checkboxBoxChecked,
                    ]}
                  >
                    {consents.acceptPersonalData && (
                      <MaterialCommunityIcons
                        name="check"
                        size={16}
                        color={COLORS.cardBackground}
                      />
                    )}
                  </View>
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
                  style={styles.checkboxHit}
                  onPress={() => toggleConsent("acceptPrivacyPolicy")}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: consents.acceptPrivacyPolicy }}
                >
                  <View
                    style={[
                      styles.checkboxBox,
                      consents.acceptPrivacyPolicy && styles.checkboxBoxChecked,
                    ]}
                  >
                    {consents.acceptPrivacyPolicy && (
                      <MaterialCommunityIcons
                        name="check"
                        size={16}
                        color={COLORS.cardBackground}
                      />
                    )}
                  </View>
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
                  style={styles.checkboxHit}
                  onPress={() => toggleConsent("acceptDataDistribution")}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: consents.acceptDataDistribution }}
                >
                  <View
                    style={[
                      styles.checkboxBox,
                      consents.acceptDataDistribution && styles.checkboxBoxChecked,
                    ]}
                  >
                    {consents.acceptDataDistribution && (
                      <MaterialCommunityIcons
                        name="check"
                        size={16}
                        color={COLORS.cardBackground}
                      />
                    )}
                  </View>
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
              {errors.consent ? (
                <Text
                  style={[styles.errorText, styles.consentErrorText]}
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                >
                  {errors.consent}
                </Text>
              ) : null}
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

          {/* Метка бандла: после применения OTA меняется префикс ota xxxxxxxx */}
          <Text style={styles.otaBundleHint} pointerEvents="none">
            {getOtaRuntimeFingerprintText()}
          </Text>
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
  emailTypoHint: {
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#636128",
    backgroundColor: "rgba(99, 97, 40, 0.08)",
    gap: 8,
  },
  emailTypoHintText: {
    fontSize: 10,
    fontFamily: FONTS.montserrat,
    lineHeight: 14,
    color: COLORS.primary,
  },
  emailTypoFix: {
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  emailTypoFixText: {
    fontSize: 10,
    fontFamily: FONTS.montserrat,
    color: COLORS.onPrimary,
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
    alignItems: "center",
    gap: 8,
  },
  checkboxHit: {
    width: Platform.OS === "ios" ? 44 : 48,
    height: Platform.OS === "ios" ? 44 : 48,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 0,
    marginLeft: -6,
  },
  checkboxBox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: "#636128",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxBoxChecked: {
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
  /** Сообщение про все три согласия — чуть крупнее, чем у полей */
  consentErrorText: {
    marginTop: 6,
    fontSize: 10,
    lineHeight: 14,
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
  /** Едва заметная подсказка для проверки OTA; не тянется с web */
  otaBundleHint: {
    marginTop: 10,
    marginBottom: 4,
    alignSelf: "center",
    maxWidth: "100%",
    fontSize: 8,
    lineHeight: 11,
    fontFamily: FONTS.montserrat,
    color: COLORS.text,
    opacity: 0.26,
    textAlign: "center",
  },
});
