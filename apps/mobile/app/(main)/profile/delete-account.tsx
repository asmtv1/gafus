import { useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import { Text, Snackbar } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";

import { COLORS, SPACING } from "@/constants";
import { Button, Input } from "@/shared/components/ui";
import { userApi } from "@/shared/lib/api/user";
import { reportClientError } from "@/shared/lib/tracer";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { useAuthStore } from "@/shared/stores";

const ACCOUNT_DELETION_WEB_URL = process.env.EXPO_PUBLIC_ACCOUNT_DELETION_URL?.trim() ?? "";

export default function DeleteAccountScreen() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

  const { data: profileData } = useQuery({
    queryKey: ["user-profile"],
    queryFn: () => userApi.getProfile(),
  });
  const hasAppPassword = profileData?.data?.hasAppPassword ?? false;

  const openWebDeletion = () => {
    if (ACCOUNT_DELETION_WEB_URL) {
      void Linking.openURL(ACCOUNT_DELETION_WEB_URL);
    }
  };

  const onDelete = async () => {
    const trimmed = password.trim();
    if (!trimmed) {
      setError("Введите пароль");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await userApi.deleteAccount(trimmed);
      if (result.success) {
        hapticFeedback.success();
        await useAuthStore.getState().logout();
        return;
      }
      setError(result.error ?? "Не удалось удалить аккаунт");
    } catch (err) {
      reportClientError(err, { issueKey: "DeleteAccount", keys: { operation: "submit" } });
      setSnackbar({ visible: true, message: "Ошибка подключения" });
    } finally {
      setLoading(false);
    }
  };

  if (!hasAppPassword) {
    return (
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text variant="bodyLarge" style={styles.hint}>
            Чтобы удалить аккаунт, сначала установите пароль в настройках профиля.
          </Text>
          <Button
            label="Установить пароль"
            onPress={() => router.push("/profile/set-password")}
            style={styles.button}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text variant="bodyLarge" style={styles.warning}>
          Действие необратимо. Восстановление данных будет невозможно; все сессии перестанут работать.
        </Text>
        <Text style={styles.bulletTitle}>Будут удалены или обезличены:</Text>
        <Text style={styles.bullet}>• профиль и настройки;</Text>
        <Text style={styles.bullet}>• прогресс тренировок и данные обучения (в пределах сервера);</Text>
        <Text style={styles.bullet}>• push-подписки и напоминания;</Text>
        <Text style={styles.bullet}>• сессии и токены обновления.</Text>

        {ACCOUNT_DELETION_WEB_URL ? (
          <Pressable onPress={openWebDeletion} style={styles.linkWrap}>
            <Text style={styles.linkText}>Открыть ту же процедуру на сайте</Text>
          </Pressable>
        ) : null}

        <Input
          label="Текущий пароль"
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            setError(null);
          }}
          secureTextEntry
          autoComplete="password"
          style={styles.input}
        />
        {error ? (
          <Text style={styles.errorText} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <Button
          label={loading ? "Удаление…" : "Удалить навсегда"}
          onPress={onDelete}
          loading={loading}
          disabled={loading}
          style={styles.dangerButton}
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
    paddingBottom: SPACING.xl,
  },
  hint: {
    marginBottom: SPACING.md,
    color: COLORS.textSecondary,
  },
  warning: {
    marginBottom: SPACING.sm,
    color: COLORS.error,
    fontWeight: "600",
  },
  bulletTitle: {
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
    fontWeight: "600",
    color: COLORS.text,
  },
  bullet: {
    color: COLORS.textSecondary,
    marginBottom: 4,
    lineHeight: 22,
  },
  linkWrap: {
    marginVertical: SPACING.md,
  },
  linkText: {
    color: COLORS.secondary,
    textDecorationLine: "underline",
    fontSize: 15,
  },
  input: {
    marginTop: SPACING.md,
  },
  errorText: {
    color: COLORS.error,
    marginTop: SPACING.sm,
    fontSize: 14,
  },
  button: {
    marginTop: SPACING.md,
  },
  dangerButton: {
    marginTop: SPACING.lg,
    backgroundColor: "#c62828",
  },
});
