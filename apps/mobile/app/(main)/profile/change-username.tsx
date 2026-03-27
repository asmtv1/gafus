import { useState } from "react";
import { StyleSheet, ScrollView, View } from "react-native";
import { Text, Snackbar } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";

import { BORDER_RADIUS, COLORS, SPACING } from "@/constants";
import { Button, Card, Input } from "@/shared/components/ui";
import { useUsernameAvailability } from "@/shared/hooks";
import type { User } from "@/shared/lib/api/auth";
import { userApi } from "@/shared/lib/api/user";
import { reportClientError } from "@/shared/lib/tracer";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { useAuthStore } from "@/shared/stores";

const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

export default function ChangeUsernameScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user: currentUser, setUser } = useAuthStore(
    useShallow((s) => ({
      user: s.user,
      setUser: s.setUser,
    })),
  );
  const [newUsername, setNewUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });
  const { status } = useUsernameAvailability(newUsername);

  const onSave = async () => {
    const trimmed = newUsername.trim();
    if (trimmed.length < 3 || trimmed.length > 50) {
      setSnackbar({ visible: true, message: "Логин: от 3 до 50 символов" });
      return;
    }
    if (!USERNAME_REGEX.test(trimmed)) {
      setSnackbar({ visible: true, message: "Только латинские буквы, цифры и _" });
      return;
    }
    setLoading(true);
    setSnackbar({ visible: false, message: "" });
    try {
      const result = await userApi.changeUsername(trimmed);
      if (result.success && result.data?.user && currentUser) {
        hapticFeedback.success();
        const updated: User = {
          ...currentUser,
          id: result.data.user.id,
          username: result.data.user.username,
          role: result.data.user.role as User["role"],
        };
        setUser(updated);
        queryClient.invalidateQueries({ queryKey: ["user-profile"] });
        setSnackbar({ visible: true, message: "Логин изменён" });
        setTimeout(() => router.back(), 1000);
      } else {
        setSnackbar({ visible: true, message: result.error || "Не удалось сменить логин" });
      }
    } catch (err) {
      reportClientError(err, { issueKey: "ChangeUsername", keys: { operation: "save" } });
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
              <MaterialCommunityIcons name="account-outline" size={28} color={COLORS.primaryDark} />
            </View>
            <Text variant="titleMedium" style={styles.cardTitle}>
              Новый логин
            </Text>
            <Text variant="bodyMedium" style={styles.hint}>
              Логин нужен для входа. После смены при следующем входе используйте новый логин.
            </Text>
            <View style={styles.stepsBox}>
              <Text variant="bodySmall" style={styles.stepLine}>
                • От 3 до 50 символов, только латиница, цифры и символ _
              </Text>
              <Text variant="bodySmall" style={styles.stepLine}>
                • Свободность логина проверяется при вводе
              </Text>
            </View>
            <Input
              label="Новый логин"
              value={newUsername}
              onChangeText={setNewUsername}
              placeholder="mylogin"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            {status === "checking" && (
              <Text style={[styles.availabilityHint, { color: COLORS.textSecondary }]}>
                Проверка...
              </Text>
            )}
            {status === "available" && (
              <Text style={[styles.availabilityHint, { color: COLORS.success }]}>
                Логин свободен
              </Text>
            )}
            {status === "taken" && (
              <Text style={[styles.availabilityHint, { color: COLORS.error }]}>
                Логин занят
              </Text>
            )}
            <Button
              label="Сохранить"
              onPress={onSave}
              loading={loading}
              disabled={loading || status === "taken" || status === "checking"}
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
  availabilityHint: {
    marginTop: 4,
    marginBottom: SPACING.sm,
    fontSize: 14,
  },
  button: {
    marginTop: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
  },
});
