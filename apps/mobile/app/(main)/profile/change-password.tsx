import { useState } from "react";
import { StyleSheet, ScrollView, View } from "react-native";
import { Text, Snackbar, TextInput as PaperTextInput } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";

import { BORDER_RADIUS, COLORS, SPACING } from "@/constants";
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
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

  const onSave = async () => {
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
    setLoading(true);
    setSnackbar({ visible: false, message: "" });
    try {
      const result = await authApi.changePassword(currentPassword, newPassword);
      if (result.success) {
        hapticFeedback.success();
        queryClient.invalidateQueries({ queryKey: ["user-profile"] });
        setSnackbar({ visible: true, message: "Пароль изменён" });
        setTimeout(() => router.back(), 1000);
      } else {
        setSnackbar({
          visible: true,
          message: result.error || "Не удалось сменить пароль",
        });
      }
    } catch (err) {
      reportClientError(err, { issueKey: "ChangePassword", keys: { operation: "save" } });
      setSnackbar({ visible: true, message: "Ошибка подключения" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card mode="contained" style={styles.card}>
          <Card.Content>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="lock-outline" size={28} color={COLORS.primaryDark} />
            </View>
            <Text variant="titleMedium" style={styles.cardTitle}>
              Новый пароль
            </Text>
            <Text variant="bodyMedium" style={styles.hint}>
              Укажите текущий пароль и новый дважды. После сохранения старый пароль перестанет
              действовать.
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
            <Button
              label="Сохранить"
              onPress={onSave}
              loading={loading}
              disabled={loading}
              style={styles.button}
            />
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
  button: {
    marginTop: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
  },
});
