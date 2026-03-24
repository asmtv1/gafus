import { useState } from "react";
import { StyleSheet, ScrollView } from "react-native";
import { Text, Snackbar } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";

import { Button, Input } from "@/shared/components/ui";
import { authApi } from "@/shared/lib/api/auth";
import { reportClientError } from "@/shared/lib/tracer";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { COLORS, SPACING } from "@/constants";

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 100;

function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Минимум ${PASSWORD_MIN_LENGTH} символов`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Максимум ${PASSWORD_MAX_LENGTH} символов`;
  if (!/[A-Z]/.test(password)) return "Минимум одна заглавная буква";
  if (!/[a-z]/.test(password)) return "Минимум одна строчная буква";
  if (!/[0-9]/.test(password)) return "Минимум одна цифра";
  return null;
}

export default function SetPasswordScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

  const onSave = async () => {
    const passwordError = validatePassword(newPassword);
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
      const result = await authApi.setPassword(newPassword);
      if (result.success) {
        hapticFeedback.success();
        queryClient.invalidateQueries({ queryKey: ["user-profile"] });
        setSnackbar({ visible: true, message: "Пароль установлен" });
        setTimeout(() => router.back(), 1000);
      } else {
        setSnackbar({
          visible: true,
          message: result.error || "Не удалось установить пароль",
        });
      }
    } catch (err) {
      reportClientError(err, { issueKey: "SetPassword", keys: { operation: "save" } });
      setSnackbar({ visible: true, message: "Ошибка подключения" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text variant="bodyLarge" style={styles.hint}>
          Установите пароль для входа через логин. Минимум 8 символов, заглавная и строчная буквы,
          цифра.
        </Text>
        <Input
          label="Новый пароль"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          autoComplete="new-password"
          style={styles.input}
        />
        <Input
          label="Повторите пароль"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoComplete="new-password"
          style={styles.input}
        />
        <Button
          label="Сохранить"
          onPress={onSave}
          loading={loading}
          disabled={loading}
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
  hint: {
    marginBottom: SPACING.lg,
    color: COLORS.textSecondary,
  },
  input: {
    marginBottom: SPACING.md,
  },
  button: {
    marginTop: SPACING.md,
  },
});
