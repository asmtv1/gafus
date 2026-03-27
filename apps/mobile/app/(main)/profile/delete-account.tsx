import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text, Snackbar } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { BORDER_RADIUS, COLORS, SPACING } from "@/constants";
import { Button, Card, Input } from "@/shared/components/ui";
import { userApi } from "@/shared/lib/api/user";
import { reportClientError } from "@/shared/lib/tracer";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { useAuthStore } from "@/shared/stores";

const ACCOUNT_DELETION_WEB_URL = process.env.EXPO_PUBLIC_ACCOUNT_DELETION_URL?.trim() ?? "";

const CODE_RE = /^\d{6}$/;

export default function DeleteAccountScreen() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [requestLoading, setRequestLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestOk, setRequestOk] = useState<string | null>(null);
  const [requestErr, setRequestErr] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

  const { data: profileData } = useQuery({
    queryKey: ["user-profile"],
    queryFn: () => userApi.getProfile(),
  });
  const email = profileData?.data?.email?.trim() ?? "";

  const openWebDeletion = () => {
    if (ACCOUNT_DELETION_WEB_URL) {
      void Linking.openURL(ACCOUNT_DELETION_WEB_URL);
    }
  };

  const onRequestCode = async () => {
    setRequestLoading(true);
    setError(null);
    setRequestOk(null);
    setRequestErr(null);
    setSnackbar({ visible: false, message: "" });
    try {
      const result = await userApi.requestAccountDeletionCode();
      if (result.success) {
        hapticFeedback.success();
        setRequestOk("Код отправлен на ваш email (действует 15 минут).");
      } else {
        setRequestErr(result.error ?? "Не удалось отправить код");
      }
    } catch (err) {
      reportClientError(err, { issueKey: "DeleteAccount", keys: { operation: "requestCode" } });
      setRequestErr("Ошибка подключения");
    } finally {
      setRequestLoading(false);
    }
  };

  const onDelete = async () => {
    const trimmed = code.trim();
    if (!CODE_RE.test(trimmed)) {
      setError("Введите 6-значный код из письма");
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

  if (!email) {
    return (
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.cardTitle}>
                Удаление аккаунта
              </Text>
              <Text variant="bodyMedium" style={styles.hint}>
                Укажите email в профиле — на него придёт код для подтверждения удаления.
              </Text>
              <Button
                label="Указать email"
                onPress={() => router.push("/profile/change-email")}
                style={styles.primaryBtn}
              />
            </Card.Content>
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="delete-outline" size={28} color={COLORS.error} />
            </View>
            <Text variant="titleMedium" style={styles.cardTitle}>
              Удаление аккаунта
            </Text>
            <Text variant="bodyMedium" style={styles.warning}>
              Действие необратимо. Восстановление данных будет невозможно; все сессии перестанут
              работать.
            </Text>
            <Text style={styles.bulletTitle}>Будут удалены или обезличены:</Text>
            <Text style={styles.bullet}>• профиль и настройки;</Text>
            <Text style={styles.bullet}>
              • логин, email и телефон (если указаны) — из базы вместе с учётной записью;
            </Text>
            <Text style={styles.bullet}>• прогресс тренировок и данные обучения;</Text>
            <Text style={styles.bullet}>• push-подписки и напоминания;</Text>
            <Text style={styles.bullet}>• сессии и токены обновления.</Text>

            <Text variant="bodySmall" style={styles.emailHint}>
              Код будет отправлен на: {email}
            </Text>
            <Text variant="bodySmall" style={styles.codeHint}>
              Мы отправим 6-значный код на email. Без верного кода удаление невозможно.
            </Text>

            {ACCOUNT_DELETION_WEB_URL ? (
              <Pressable onPress={openWebDeletion} style={styles.linkWrap}>
                <Text style={styles.linkText}>Открыть ту же процедуру на сайте</Text>
              </Pressable>
            ) : null}

            <Button
              variant="outline"
              label={requestLoading ? "Отправка…" : "Отправить код на email"}
              onPress={onRequestCode}
              loading={requestLoading}
              disabled={requestLoading}
              style={styles.sendCodeButton}
            />

            {requestOk ? (
              <Text style={styles.successBox} accessibilityRole="text">
                {requestOk}
              </Text>
            ) : null}
            {requestErr ? (
              <Text style={styles.errorBox} accessibilityRole="alert">
                {requestErr}
              </Text>
            ) : null}

            <Input
              label="Код из письма"
              value={code}
              onChangeText={(t) => {
                setCode(t.replace(/\D/g, "").slice(0, 6));
                setError(null);
              }}
              placeholder="000000"
              keyboardType="number-pad"
              maxLength={6}
              autoComplete="one-time-code"
              style={styles.input}
            />
            <Text variant="bodySmall" style={styles.codeFieldHint}>
              Введите код и нажмите кнопку ниже, чтобы удалить аккаунт навсегда.
            </Text>
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
    paddingBottom: SPACING.xl,
  },
  card: {
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "rgba(198, 40, 40, 0.1)",
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
  primaryBtn: {
    marginTop: SPACING.sm,
  },
  warning: {
    marginBottom: SPACING.sm,
    color: COLORS.textSecondary,
    lineHeight: 22,
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
    fontSize: 14,
  },
  emailHint: {
    marginTop: SPACING.md,
    color: COLORS.text,
    fontWeight: "500",
  },
  codeHint: {
    marginTop: SPACING.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  linkWrap: {
    marginVertical: SPACING.md,
  },
  linkText: {
    color: COLORS.secondary,
    textDecorationLine: "underline",
    fontSize: 15,
  },
  /** Как .secondaryBtn на web: белый фон, оливковая обводка, тёмный текст (outline). */
  sendCodeButton: {
    marginTop: SPACING.md,
    alignSelf: "stretch",
    width: "100%",
    minHeight: 48,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  successBox: {
    marginTop: SPACING.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#e8f5e9",
    color: "#2e7d32",
    fontSize: 14,
    lineHeight: 20,
  },
  errorBox: {
    marginTop: SPACING.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#fbe9e7",
    color: "#c62828",
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    marginTop: SPACING.md,
  },
  codeFieldHint: {
    marginTop: SPACING.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  errorText: {
    color: COLORS.error,
    marginTop: SPACING.sm,
    fontSize: 14,
  },
  dangerButton: {
    marginTop: SPACING.lg,
    backgroundColor: "#c62828",
  },
});
