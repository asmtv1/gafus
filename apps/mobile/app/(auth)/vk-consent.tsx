import { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Linking } from "react-native";
import { Text, Snackbar } from "react-native-paper";
import { TexturedSafeAreaView as SafeAreaView } from "@/shared/components";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, usePathname, useRouter } from "expo-router";
import { useShallow } from "zustand/react/shallow";

import { Button, Input } from "@/shared/components/ui";
import { trackEvent } from "@/shared/lib/analytics";
import { useAuthStore } from "@/shared/stores";
import { useVkLogin } from "@/shared/hooks";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { CONSENT_DOCUMENT_URLS, type ConsentPayload } from "@/shared/constants/consent";
import { COLORS, SPACING } from "@/shared/config";

export default function VkConsentScreen() {
  const router = useRouter();
  const pathname = usePathname() ?? "/vk-consent";
  const promoCodeParam = useLocalSearchParams<{ promoCode?: string | string[] }>().promoCode;
  const { vkConsentToken, vkConsentPromoCode, submitVkConsentComplete, clearPendingVkConsent, updateVkConsentPromoCode } = useAuthStore(
    useShallow((s) => ({
      vkConsentToken: s.vkConsentToken,
      vkConsentPromoCode: s.vkConsentPromoCode,
      submitVkConsentComplete: s.submitVkConsentComplete,
      clearPendingVkConsent: s.clearPendingVkConsent,
      updateVkConsentPromoCode: s.updateVkConsentPromoCode,
    })),
  );
  const [consents, setConsents] = useState({
    acceptPersonalData: false,
    acceptPrivacyPolicy: false,
    acceptDataDistribution: false,
  });
  const [loading, setLoading] = useState(false);
  const [promoCode, setPromoCode] = useState(
    typeof promoCodeParam === "string" ? promoCodeParam : vkConsentPromoCode ?? "",
  );
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });
  const [contextExpired, setContextExpired] = useState(false);
  const { handleVkLogin, isVkLoading } = useVkLogin({
    onError: (message) => setSnackbar({ visible: true, message }),
  });

  const toggleConsent = (key: keyof typeof consents) => {
    setConsents((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const allAccepted =
    consents.acceptPersonalData &&
    consents.acceptPrivacyPolicy &&
    consents.acceptDataDistribution;

  const onSubmit = async () => {
    if (!allAccepted) {
      setSnackbar({ visible: true, message: "Необходимо принять все согласия" });
      return;
    }
    if (!vkConsentToken) {
      setSnackbar({ visible: true, message: "Сессия истекла. Повторите вход через VK." });
      return;
    }

    const consentPayload: ConsentPayload = {
      acceptPersonalData: true,
      acceptPrivacyPolicy: true,
      acceptDataDistribution: true,
    };

    setLoading(true);
    setSnackbar({ visible: false, message: "" });
    const result = await submitVkConsentComplete(consentPayload, promoCode.trim() || undefined);
    setLoading(false);

    if (result.success) {
      hapticFeedback.success();
      if (useAuthStore.getState().isAuthenticated) {
        trackEvent({
          eventName: "login_success",
          platform: "mobile",
          pathOrScreen: pathname,
          method: "vk",
        });
      }
      // AuthProvider перенаправит (pendingVkPhone → vk-set-phone или isAuthenticated → main)
    } else {
      if (["CONTEXT_INVALID", "CONTEXT_EXPIRED", "VK_CONTEXT_PURPOSE_INVALID"].includes(result.code ?? "")) {
        setContextExpired(true);
      }
      setSnackbar({ visible: true, message: result.error || "Ошибка сохранения" });
    }
  };

  const handleBack = async () => {
    await clearPendingVkConsent();
    router.replace("/welcome");
  };

  const restartVk = async () => {
    await clearPendingVkConsent();
    setContextExpired(false);
    await handleVkLogin(promoCode.trim() || undefined);
  };

  if (!vkConsentToken) {
    return (
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <Text variant="titleLarge" style={styles.title}>
          Ссылка устарела
        </Text>
        <Text variant="bodyLarge" style={styles.hint}>
          Повторите вход через VK ID.
        </Text>
        <Button label="Повторить вход через VK" onPress={() => void restartVk()} loading={isVkLoading} style={styles.button} />
        <Button label="На главную" variant="outline" onPress={() => void handleBack()} style={styles.button} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text variant="titleLarge" style={styles.title}>
          Согласия
        </Text>
        <Text variant="bodyLarge" style={styles.hint}>
          Для завершения регистрации примите согласия.
        </Text>

        <View style={styles.consentsContainer}>
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
        </View>
        <Input
          label="Промокод"
          value={promoCode}
          onChangeText={(value) => {
            setPromoCode(value);
            void updateVkConsentPromoCode(value);
          }}
          placeholder="Необязательно"
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.promoCodeInput}
        />

        <Button
          label="Принять и продолжить"
          onPress={onSubmit}
          loading={loading}
          disabled={loading || !allAccepted}
          style={styles.button}
        />
        {contextExpired ? (
          <Button
            label="Повторить вход через VK"
            variant="outline"
            onPress={() => void restartVk()}
            loading={isVkLoading}
            style={styles.button}
          />
        ) : null}
      </ScrollView>
      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar((s) => ({ ...s, visible: false }))}
        duration={4000}
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
  scroll: {
    padding: SPACING.lg,
  },
  title: {
    marginBottom: SPACING.md,
  },
  hint: {
    marginBottom: SPACING.lg,
    color: COLORS.textSecondary,
  },
  consentsContainer: {
    marginBottom: SPACING.lg,
  },
  consentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: SPACING.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.primary,
    marginRight: SPACING.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
  },
  consentText: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
  },
  consentLink: {
    color: COLORS.primary,
    textDecorationLine: "underline",
  },
  button: {
    marginTop: SPACING.md,
  },
  promoCodeInput: {
    marginBottom: SPACING.sm,
  },
});
