import { useState, useRef, useEffect } from "react";
import { StyleSheet, ScrollView, View } from "react-native";
import { Text, Snackbar } from "react-native-paper";
import { TexturedSafeAreaView as SafeAreaView } from "@/shared/components";
import { Stack, useRouter } from "expo-router";
import { ProfileIcon } from "@/features/profile";

import { Button, Input, Card } from "@/shared/components/ui";
import { userApi } from "@/shared/lib/api/user";
import { useAuthStore } from "@/shared/stores/authStore";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { reportClientError } from "@/shared/lib/tracer";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { BORDER_RADIUS, COLORS, SPACING } from "@/shared/config";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ChangeEmailScreen() {
  const router = useRouter();
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });
  const [unknown, setUnknown] = useState(false);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const unknownRef = useRef(false);
  const confirmedRef = useRef(false);
  const backTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authUser = useAuthStore((state) => state.user);
  const authenticated = useAuthStore((state) => state.isAuthenticated);
  const authLoading = useAuthStore((state) => state.isLoading);
  const owner = authenticated && !authLoading ? (authUser?.id ?? null) : null;
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  const epoch = owner && binding?.principalId === owner ? binding.authEpoch : null;
  const current = (actor: { ownerId: string; authEpoch: string }) => {
    const state = useAuthStore.getState();
    const verified = newOnlyV2NativeQueues.getVerifiedBinding();
    return (
      mounted.current &&
      state.isAuthenticated &&
      !state.isLoading &&
      state.user?.id === actor.ownerId &&
      verified?.principalId === actor.ownerId &&
      verified.authEpoch === actor.authEpoch
    );
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (backTimer.current !== null) clearTimeout(backTimer.current);
      backTimer.current = null;
    };
  }, []);
  useEffect(() => {
    // Changing verified actor never reuses prior account email form state.
    unknownRef.current = false;
    confirmedRef.current = false;
    inFlight.current = false;
    setUnknown(false);
    setLoading(false);
    setNewEmail("");
    setCurrentPassword("");
    setFieldError("");
    setSnackbar({ visible: false, message: "" });
    if (backTimer.current !== null) clearTimeout(backTimer.current);
    backTimer.current = null;
  }, [owner, epoch]);

  const onSend = async () => {
    if (inFlight.current || unknownRef.current || confirmedRef.current || !owner || !epoch) return;
    const actor = { ownerId: owner, authEpoch: epoch };
    if (!current(actor)) return;
    const trimmed = newEmail.trim().toLowerCase();
    setFieldError("");
    if (!trimmed) {
      setFieldError("Введите email");
      return;
    }
    if (!EMAIL_RE.test(trimmed)) {
      setFieldError("Некорректный формат email");
      return;
    }
    inFlight.current = true;
    setLoading(true);
    setSnackbar({ visible: false, message: "" });
    try {
      const result = await userApi.requestEmailChange(
        trimmed, () => current(actor), currentPassword || undefined,
      );
      if (!current(actor)) return;
      if (result.success) {
        confirmedRef.current = true;
        setCurrentPassword("");
        hapticFeedback.success();
        setSnackbar({
          visible: true,
          message: "Письмо отправлено. Проверьте новый почтовый ящик.",
        });
        backTimer.current = setTimeout(() => {
          backTimer.current = null;
          if (current(actor) && confirmedRef.current) router.back();
        }, 2200);
      } else if (!result.code && result.error === "Неверный текущий пароль") {
        setSnackbar({ visible: true, message: "Введите правильный текущий пароль." });
      } else {
        unknownRef.current = true;
        setUnknown(true);
        setSnackbar({
          visible: true,
          message:
            "Результат отправки неизвестен. Проверьте почту; повторная отправка заблокирована.",
        });
      }
    } catch {
      if (current(actor)) {
        reportClientError(new Error("EMAIL_CHANGE_SEND_UNKNOWN"), {
          issueKey: "ChangeEmail",
          keys: { operation: "send" },
        });
        unknownRef.current = true;
        setUnknown(true);
        setSnackbar({
          visible: true,
          message:
            "Результат отправки неизвестен. Проверьте почту; повторная отправка заблокирована.",
        });
      }
    } finally {
      if (current(actor)) {
        inFlight.current = false;
        setLoading(false);
      }
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Card mode="contained" style={styles.card}>
            <Card.Content>
              <View style={styles.iconWrap}>
                <ProfileIcon name="email" size={28} />
              </View>
              <Text variant="titleMedium" style={styles.cardTitle}>
                Новый адрес
              </Text>
              <Text variant="bodyMedium" style={styles.hint}>
                На указанный email придёт письмо со ссылкой для подтверждения. Текущий email
                останется активен, пока вы не откроете ссылку из письма.
              </Text>
              <View style={styles.stepsBox}>
                <Text variant="bodySmall" style={styles.stepLine}>
                  • Введите адрес и нажмите «Отправить письмо»
                </Text>
                <Text variant="bodySmall" style={styles.stepLine}>
                  • Ссылка в письме действует ограниченное время
                </Text>
              </View>
              <Input
                label="Новый email"
                value={newEmail}
                onChangeText={(t) => {
                  setNewEmail(t);
                  if (fieldError) {
                    setFieldError("");
                  }
                }}
                placeholder="email@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                editable={!loading && !unknown}
                error={fieldError}
                style={styles.input}
              />
              <Input
                label="Текущий пароль (если установлен)"
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
                autoComplete="password"
                editable={!loading && !unknown}
                style={styles.input}
              />
              <Text variant="bodySmall" style={styles.hint}>
                Для аккаунта с паролем его нужно указать. При входе только через VK ID
                поле оставьте пустым.
              </Text>
              <View style={styles.actions}>
                <Button
                  label={loading ? "Отправка…" : "Отправить письмо"}
                  onPress={onSend}
                  loading={loading}
                  disabled={loading || unknown || !owner || !epoch}
                  animatedPress
                />
                <Button
                  label="Отмена"
                  variant="secondary"
                  onPress={() => {
                    void hapticFeedback.light();
                    router.back();
                  }}
                  disabled={loading}
                  animatedPress
                  accessibilityHint="Закрывает экран без сохранения изменений"
                />
              </View>
            </Card.Content>
          </Card>
        </ScrollView>
        <Snackbar
          visible={snackbar.visible}
          onDismiss={() => setSnackbar((s) => ({ ...s, visible: false }))}
          duration={4000}
        >
          {snackbar.message}
        </Snackbar>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  card: {
    backgroundColor: COLORS.cardBackground,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.xl,
    overflow: "hidden",
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "rgba(99, 97, 40, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(99, 97, 40, 0.28)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.md,
  },
  cardTitle: {
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  hint: {
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: SPACING.md,
  },
  stepsBox: {
    backgroundColor: "rgba(255, 255, 255, 0.65)",
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  stepLine: {
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 4,
  },
  input: {
    marginBottom: SPACING.xs,
  },
  actions: {
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
});
