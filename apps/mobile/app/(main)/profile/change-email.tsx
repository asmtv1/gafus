import { useState } from "react";
import { StyleSheet, ScrollView, View } from "react-native";
import { Text, Snackbar } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Button, Input, Card } from "@/shared/components/ui";
import { userApi } from "@/shared/lib/api/user";
import { reportClientError } from "@/shared/lib/tracer";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { BORDER_RADIUS, COLORS, SPACING } from "@/constants";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ChangeEmailScreen() {
  const router = useRouter();
  const [newEmail, setNewEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

  const onSend = async () => {
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
    setLoading(true);
    setSnackbar({ visible: false, message: "" });
    try {
      const result = await userApi.requestEmailChange(trimmed);
      if (result.success) {
        hapticFeedback.success();
        setSnackbar({
          visible: true,
          message: "Письмо отправлено. Проверьте новый почтовый ящик.",
        });
        setTimeout(() => router.back(), 2200);
      } else {
        setSnackbar({
          visible: true,
          message: result.error || "Не удалось отправить письмо",
        });
      }
    } catch (err) {
      reportClientError(err, { issueKey: "ChangeEmail", keys: { operation: "send" } });
      setSnackbar({ visible: true, message: "Ошибка подключения" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="email-outline" size={28} color={COLORS.primaryDark} />
            </View>
            <Text variant="titleMedium" style={styles.cardTitle}>
              Новый адрес
            </Text>
            <Text variant="bodyMedium" style={styles.hint}>
              На указанный email придёт письмо со ссылкой для подтверждения. Текущий email останется
              активен, пока вы не откроете ссылку из письма.
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
              error={fieldError}
              style={styles.input}
            />
            <Button
              label={loading ? "Отправка…" : "Отправить письмо"}
              onPress={onSend}
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
    marginBottom: SPACING.xs,
  },
  button: {
    marginTop: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
  },
});
