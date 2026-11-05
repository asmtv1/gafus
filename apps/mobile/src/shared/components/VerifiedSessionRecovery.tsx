import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { COLORS, SPACING } from "@/shared/config";
import { Loading } from "@/shared/components/ui/Loading";
import { TexturedSafeAreaView } from "@/shared/components/TexturedSafeAreaView";
import { useAuthStore } from "@/shared/stores/authStore";
import { useNetworkStatusStore } from "@/shared/stores/networkStatusStore";
import { reportClientError } from "@/shared/lib/tracer";

const STARTUP_GRACE_MS = 5000;

/** Authenticated cached user, but the new version has no verified native binding yet. */
export function VerifiedSessionRecovery() {
  const [showHelp, setShowHelp] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const isOffline = useNetworkStatusStore((state) => state.isOffline);
  const wasOffline = useRef(isOffline);

  useEffect(() => {
    const timer = setTimeout(() => setShowHelp(true), STARTUP_GRACE_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const reconnected = wasOffline.current && !isOffline;
    wasOffline.current = isOffline;
    if (reconnected) {
      // checkAuth is already single-flight. A reconnect must not require a reinstall.
      void useAuthStore.getState().checkAuth().catch((error: unknown) => {
        reportClientError(error, { issueKey: "VerifiedSessionRecovery" });
      });
    }
  }, [isOffline]);

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await useAuthStore.getState().checkAuth();
    } catch (error) {
      reportClientError(error, { issueKey: "VerifiedSessionRecovery" });
    } finally {
      setRetrying(false);
    }
  };

  const confirmNewLogin = () => {
    Alert.alert(
      "Войти заново?",
      "Сначала попробуйте восстановить сессию. Повторный вход не требует переустановки приложения.",
      [
        { text: "Отмена", style: "cancel" },
        { text: "Выйти", style: "destructive", onPress: () => {
          void useAuthStore.getState().logout();
        } },
      ],
    );
  };

  if (!showHelp) return <Loading fullScreen message="Проверяем сессию после обновления…" />;
  return (
    <TexturedSafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.card}>
        <Text style={styles.title}>Восстанавливаем доступ</Text>
        <Text style={styles.message}>
          {isOffline
            ? "Для завершения обновления требуется интернет. Ваш вход сохранён — подключитесь к сети."
            : "Не удалось завершить восстановление сессии. Ваши данные сохранены. Попробуйте ещё раз."}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Повторить восстановление сессии"
          disabled={retrying} onPress={() => void retry()} style={styles.primary}>
          <Text style={styles.primaryText}>{retrying ? "Проверяем…" : "Попробовать снова"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Войти заново"
          onPress={confirmNewLogin} style={styles.secondary}>
          <Text style={styles.secondaryText}>Войти заново</Text>
        </Pressable>
      </View>
    </TexturedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", padding: SPACING.md },
  card: { gap: 18, padding: 22, borderRadius: 18, backgroundColor: "#fffaf0",
    borderWidth: 1, borderColor: "#dfe4d3", alignItems: "center" },
  title: { fontSize: 21, fontWeight: "700", color: COLORS.text, textAlign: "center" },
  message: { fontSize: 14, lineHeight: 21, color: COLORS.textSecondary,
    textAlign: "center" },
  primary: { backgroundColor: COLORS.primary, borderRadius: 12, padding: 14,
    alignItems: "center", width: "100%" },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  secondary: { padding: 12 },
  secondaryText: { fontSize: 14, color: COLORS.primary, fontWeight: "600" },
});
