import { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Linking } from "react-native";
import { Text, Snackbar } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useShallow } from "zustand/react/shallow";

import { Button } from "@/shared/components/ui";
import { useAuthStore } from "@/shared/stores";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { CONSENT_DOCUMENT_URLS, type ConsentPayload } from "@/shared/constants/consent";
import { COLORS, SPACING } from "@/constants";

export default function VkConsentScreen() {
  const router = useRouter();
  const { vkConsentToken, submitVkConsentComplete, clearPendingVkConsent } = useAuthStore(
    useShallow((s) => ({
      vkConsentToken: s.vkConsentToken,
      submitVkConsentComplete: s.submitVkConsentComplete,
      clearPendingVkConsent: s.clearPendingVkConsent,
    })),
  );
  const [consents, setConsents] = useState({
    acceptPersonalData: false,
    acceptPrivacyPolicy: false,
    acceptDataDistribution: false,
  });
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

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
    const result = await submitVkConsentComplete(consentPayload);
    setLoading(false);

    if (result.success) {
      hapticFeedback.success();
      // AuthProvider перенаправит (pendingVkPhone → vk-set-phone или isAuthenticated → main)
    } else {
      setSnackbar({ visible: true, message: result.error || "Ошибка сохранения" });
    }
  };

  const handleBack = () => {
    clearPendingVkConsent();
    router.replace("/welcome");
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
        <Button label="На главную" onPress={handleBack} style={styles.button} />
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

        <Button
          label="Принять и продолжить"
          onPress={onSubmit}
          loading={loading}
          disabled={loading || !allAccepted}
          style={styles.button}
        />
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
});
