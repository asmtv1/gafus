import { useEffect, useRef, useState } from "react";
import { StyleSheet, ScrollView, View } from "react-native";
import { Text, Snackbar } from "react-native-paper";
import { TexturedSafeAreaView as SafeAreaView } from "@/shared/components";
import { Stack, useRouter } from "expo-router";
import { ProfileIcon } from "@/features/profile";
import { useQueryClient } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";

import { BORDER_RADIUS, COLORS, SPACING } from "@/shared/config";
import { Button, Card, Input } from "@/shared/components/ui";
import { useUsernameAvailability } from "@/shared/hooks";
import type { User } from "@/shared/lib/api/auth";
import { userApi } from "@/shared/lib/api/user";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { reportClientError } from "@/shared/lib/tracer";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { useAuthStore } from "@/shared/stores";

const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

export default function ChangeUsernameScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    user: currentUser,
    isAuthenticated,
    isLoading,
    setUser,
  } = useAuthStore(
    useShallow((s) => ({
      user: s.user,
      isAuthenticated: s.isAuthenticated,
      isLoading: s.isLoading,
      setUser: s.setUser,
    })),
  );
  const [newUsername, setNewUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });
  const { status } = useUsernameAvailability(newUsername);
  const owner = isAuthenticated && !isLoading ? (currentUser?.id ?? null) : null;
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  const epoch = owner && binding?.principalId === owner ? binding.authEpoch : null;
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const unknownRef = useRef(false);
  const confirmedRef = useRef(false);
  const backTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isCurrent = (actor: { ownerId: string; authEpoch: string }) => {
    const auth = useAuthStore.getState();
    const verified = newOnlyV2NativeQueues.getVerifiedBinding();
    return (
      mounted.current &&
      auth.isAuthenticated &&
      !auth.isLoading &&
      auth.user?.id === actor.ownerId &&
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
    // A fresh principal or auth epoch must never inherit a previous submit or result.
    inFlight.current = false;
    unknownRef.current = false;
    confirmedRef.current = false;
    if (backTimer.current !== null) clearTimeout(backTimer.current);
    backTimer.current = null;
    setNewUsername("");
    setLoading(false);
    setUnknown(false);
    setSnackbar({ visible: false, message: "" });
  }, [owner, epoch]);

  const onSave = async () => {
    if (inFlight.current || unknownRef.current || confirmedRef.current || !owner || !epoch) return;
    const actor = { ownerId: owner, authEpoch: epoch };
    if (!isCurrent(actor)) return;
    const trimmed = newUsername.trim();
    if (trimmed.length < 3 || trimmed.length > 50) {
      setSnackbar({ visible: true, message: "Логин: от 3 до 50 символов" });
      return;
    }
    if (!USERNAME_REGEX.test(trimmed)) {
      setSnackbar({ visible: true, message: "Только латинские буквы, цифры и _" });
      return;
    }
    if (status === "taken" || status === "checking") return;

    inFlight.current = true;
    setLoading(true);
    setSnackbar({ visible: false, message: "" });
    try {
      // The current native Bearer/JSON route stays unchanged; the guard
      // prevents a late 401 refresh/replay from crossing a principal epoch.
      const result = await userApi.changeUsername(trimmed, () => isCurrent(actor));
      if (!isCurrent(actor)) return;
      if (
        result.success &&
        result.data?.user?.id === actor.ownerId &&
        result.data.user.username === trimmed &&
        typeof result.data.user.role === "string"
      ) {
        const liveUser = useAuthStore.getState().user;
        if (!liveUser || liveUser.id !== actor.ownerId) return;
        confirmedRef.current = true;
        const updated: User = {
          ...liveUser,
          username: result.data.user.username,
          role: result.data.user.role as User["role"],
        };
        setUser(updated);
        hapticFeedback.success();
        setSnackbar({ visible: true, message: "Логин изменён" });
        // A confirmed write must not become "unknown" if cache invalidation fails.
        void queryClient.invalidateQueries({ queryKey: ["user-profile"] }).catch(() => {
          reportClientError(new Error("USERNAME_CACHE_REFRESH_FAILED"), {
            issueKey: "ChangeUsername",
            keys: { operation: "invalidate" },
          });
        });
        backTimer.current = setTimeout(() => {
          backTimer.current = null;
          if (isCurrent(actor) && confirmedRef.current) router.back();
        }, 1000);
      } else if (!result.success && result.code === "USERNAME_TAKEN") {
        setSnackbar({ visible: true, message: "Логин уже занят" });
      } else {
        unknownRef.current = true;
        setUnknown(true);
        setSnackbar({
          visible: true,
          message: "Результат смены логина неизвестен. Проверьте профиль перед новой попыткой.",
        });
      }
    } catch {
      if (isCurrent(actor)) {
        reportClientError(new Error("USERNAME_CHANGE_RESULT_UNKNOWN"), {
          issueKey: "ChangeUsername",
          keys: { operation: "save" },
        });
        unknownRef.current = true;
        setUnknown(true);
        setSnackbar({
          visible: true,
          message: "Результат смены логина неизвестен. Проверьте профиль перед новой попыткой.",
        });
      }
    } finally {
      if (isCurrent(actor)) {
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
                <ProfileIcon name="login" size={28} />
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
                <Text style={[styles.availabilityHint, { color: COLORS.error }]}>Логин занят</Text>
              )}
              <View style={styles.actions}>
                <Button
                  label="Сохранить"
                  onPress={onSave}
                  loading={loading}
                  disabled={
                    loading ||
                    unknown ||
                    !owner ||
                    !epoch ||
                    confirmedRef.current ||
                    status === "taken" ||
                    status === "checking"
                  }
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
  availabilityHint: {
    marginTop: 4,
    marginBottom: SPACING.sm,
    fontSize: 14,
  },
  actions: {
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
});
