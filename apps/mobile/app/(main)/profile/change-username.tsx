import { useState } from "react";
import { StyleSheet, ScrollView } from "react-native";
import { Text, Snackbar } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";

import { Button, Input } from "@/shared/components/ui";
import type { User } from "@/shared/lib/api/auth";
import { userApi } from "@/shared/lib/api/user";
import { useAuthStore } from "@/shared/stores";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { COLORS, SPACING } from "@/constants";

const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

export default function ChangeUsernameScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user: currentUser, setUser } = useAuthStore();
  const [newUsername, setNewUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

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
    } catch {
      setSnackbar({ visible: true, message: "Ошибка подключения" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text variant="bodyLarge" style={styles.hint}>
          Логин используется для входа. Минимум 3 символа, только латинские буквы, цифры и _.
        </Text>
        <Input
          label="Новый логин"
          value={newUsername}
          onChangeText={setNewUsername}
          placeholder="mylogin"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <Button
          mode="contained"
          onPress={onSave}
          loading={loading}
          disabled={loading}
          style={styles.button}
        >
          Сохранить
        </Button>
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
