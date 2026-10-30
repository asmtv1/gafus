import { useState, useRef, useEffect } from "react";
import { StyleSheet, ScrollView, View } from "react-native";
import { Text, Snackbar, TextInput as PaperTextInput } from "react-native-paper";
import { TexturedSafeAreaView as SafeAreaView } from "@/shared/components";
import { Stack, useRouter } from "expo-router";
import { ProfileIcon } from "@/features/profile";
import { useAuthStore } from "@/shared/stores/authStore";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";

import { BORDER_RADIUS, COLORS, SPACING } from "@/shared/config";
import { Button, Card, Input } from "@/shared/components/ui";
import { authApi } from "@/shared/lib/api/auth";
import { reportClientError } from "@/shared/lib/tracer";
import { hapticFeedback } from "@/shared/lib/utils/haptics";

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 100;

function validateNewPassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Минимум ${PASSWORD_MIN_LENGTH} символов`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Максимум ${PASSWORD_MAX_LENGTH} символов`;
  if (!/[A-Z]/.test(password)) return "Минимум одна заглавная буква";
  if (!/[a-z]/.test(password)) return "Минимум одна строчная буква";
  if (!/[0-9]/.test(password)) return "Минимум одна цифра";
  return null;
}

export default function ChangePasswordScreen() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });
  const mounted = useRef(true);
  const sending = useRef(false);
  const unknownRef = useRef(false);
  const confirmedRef = useRef(false);
  const logout = useAuthStore((state) => state.logout);
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
    };
  }, []);
  useEffect(() => {
    sending.current = false;
    unknownRef.current = false;
    confirmedRef.current = false;
    setLoading(false);
    setUnknown(false);
    setConfirmed(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setSnackbar({ visible: false, message: "" });
  }, [owner, epoch]);

  const onSave = async () => {
    if (sending.current || unknownRef.current || confirmedRef.current || !owner || !epoch) return;
    const actor = { ownerId: owner, authEpoch: epoch };
    if (!current(actor)) return;
    if (!currentPassword.trim()) {
      setSnackbar({ visible: true, message: "Введите текущий пароль" });
      return;
    }
    const passwordError = validateNewPassword(newPassword);
    if (passwordError) {
      setSnackbar({ visible: true, message: passwordError });
      return;
    }
    if (newPassword !== confirmPassword) {
      setSnackbar({ visible: true, message: "Пароли не совпадают" });
      return;
    }
    sending.current = true;
    setLoading(true);
    setSnackbar({ visible: false, message: "" });
    try {
      const result = await authApi.changePassword(currentPassword, newPassword, () =>
        current(actor),
      );
      if (!current(actor)) return;
      if (result.success) {
        confirmedRef.current = true;
        setConfirmed(true);
        // Password credentials are not read back. Server ACK is the only
        // confirmed write proof; Core revokes prior refresh sessions on commit.
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        hapticFeedback.success();
        setSnackbar({
          visible: true,
          message: "Пароль изменён. Все сеансы завершены. Войдите заново.",
        });
        // AG1 Core atomically advances sessionsRevokedAt and revokes refresh tokens.
        // Never navigate back into authenticated screens with locally cached tokens.
        try {
          await logout();
          const state = useAuthStore.getState();
          if (mounted.current && !state.isAuthenticated && !state.user) {
            router.replace("/(auth)/login");
          }
        } catch {
          reportClientError(new Error("PASSWORD_CHANGE_LOCAL_SIGNOUT_FAILED"), {
            issueKey: "ChangePassword",
            keys: { operation: "local_signout" },
          });
          if (mounted.current) {
            setSnackbar({
              visible: true,
              message:
                "Пароль изменён, но выход не завершён. Закройте приложение и войдите заново.",
            });
          }
        }
      } else if (
        !result.code &&
        ["Неверный текущий пароль", "Сначала установите пароль", "Пользователь не найден"].includes(
          result.error ?? "",
        )
      ) {
        // AG1 returns precisely these precommit business validation 400s.
        setSnackbar({
          visible: true,
          message:
            result.error === "Неверный текущий пароль"
              ? "Неверный текущий пароль"
              : "Проверка пароля не пройдена. Изменений нет.",
        });
      } else {
        unknownRef.current = true;
        setUnknown(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setSnackbar({
          visible: true,
          message: "Результат смены пароля неизвестен. Повторная отправка заблокирована.",
        });
      }
    } catch {
      if (current(actor)) {
        reportClientError(new Error("PASSWORD_CHANGE_RESULT_UNKNOWN"), {
          issueKey: "ChangePassword",
          keys: { operation: "save" },
        });
        unknownRef.current = true;
        setUnknown(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setSnackbar({
          visible: true,
          message: "Результат смены пароля неизвестен. Повторная отправка заблокирована.",
        });
      }
    } finally {
      if (current(actor)) {
        sending.current = false;
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
                <ProfileIcon name="password" size={28} />
              </View>
              <Text variant="titleMedium" style={styles.cardTitle}>
                Новый пароль
              </Text>
              <Text variant="bodyMedium" style={styles.hint}>
                Укажите текущий пароль и новый дважды. После сохранения старый пароль перестанет
                действовать. Все сеансы завершатся, потребуется повторный вход.
              </Text>
              <View style={styles.stepsBox}>
                <Text variant="bodySmall" style={styles.stepLine}>
                  • Минимум 8 символов, максимум 100
                </Text>
                <Text variant="bodySmall" style={styles.stepLine}>
                  • Заглавная и строчная буква, минимум одна цифра
                </Text>
                <Text variant="bodySmall" style={styles.stepLine}>
                  • Поля «Новый пароль» и «Повторите» должны совпадать
                </Text>
              </View>
              <Input
                label="Текущий пароль"
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry={!showCurrent}
                autoComplete="password"
                style={styles.input}
                right={
                  <PaperTextInput.Icon
                    icon={showCurrent ? "eye-off-outline" : "eye-outline"}
                    onPress={() => setShowCurrent((v) => !v)}
                    accessibilityLabel={showCurrent ? "Скрыть пароль" : "Показать пароль"}
                  />
                }
              />
              <Input
                label="Новый пароль"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showNew}
                autoComplete="new-password"
                style={styles.input}
                right={
                  <PaperTextInput.Icon
                    icon={showNew ? "eye-off-outline" : "eye-outline"}
                    onPress={() => setShowNew((v) => !v)}
                    accessibilityLabel={showNew ? "Скрыть пароль" : "Показать пароль"}
                  />
                }
              />
              <Input
                label="Повторите пароль"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirm}
                autoComplete="new-password"
                style={styles.input}
                right={
                  <PaperTextInput.Icon
                    icon={showConfirm ? "eye-off-outline" : "eye-outline"}
                    onPress={() => setShowConfirm((v) => !v)}
                    accessibilityLabel={showConfirm ? "Скрыть пароль" : "Показать пароль"}
                  />
                }
              />
              <View style={styles.actions}>
                <Button
                  label="Сохранить"
                  onPress={onSave}
                  loading={loading}
                  disabled={loading || unknown || confirmed || !owner || !epoch}
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
    marginBottom: SPACING.sm,
  },
  actions: {
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
});
