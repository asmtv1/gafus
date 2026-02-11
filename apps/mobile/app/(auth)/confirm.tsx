import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useAuthStore } from "@/shared/stores";
import { API_BASE_URL, COLORS, SPACING, FONTS } from "@/constants";

const TELEGRAM_BOT_URL = "https://t.me/dog_trainer_register_bot";
const POLL_INTERVAL_MS = 5000;

export default function ConfirmScreen() {
  const router = useRouter();
  const { pendingConfirmPhone, clearPendingConfirmPhone } = useAuthStore();
  const [isPolling, setIsPolling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const phone = pendingConfirmPhone;
    if (!phone) {
      router.replace("/");
      return;
    }

    const checkConfirmed = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/auth/check-confirmed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        });
        const json = await res.json();
        if (json?.success && json?.data?.confirmed === true) {
          clearPendingConfirmPhone();
          if (intervalRef.current) clearInterval(intervalRef.current);
          router.replace("/");
        }
      } catch {
        // no-op, next poll retry
      }
    };

    setIsPolling(true);
    intervalRef.current = setInterval(checkConfirmed, POLL_INTERVAL_MS);
    void checkConfirmed();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pendingConfirmPhone, clearPendingConfirmPhone, router]);

  if (!pendingConfirmPhone) return null;

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <Text style={styles.title}>Подтвердите номер</Text>
      <Text style={styles.text}>
        Откройте Telegram-бота и следуйте инструкциям для подтверждения номера.
      </Text>
      <Pressable style={styles.button} onPress={() => Linking.openURL(TELEGRAM_BOT_URL)}>
        <Text style={styles.buttonText}>Открыть Telegram</Text>
      </Pressable>
      {isPolling && (
        <View style={styles.pollingBlock}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.hint}>Ожидаем подтверждения...</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: SPACING.lg,
    justifyContent: "center",
    backgroundColor: COLORS.background,
  },
  title: {
    fontSize: 24,
    fontFamily: FONTS.impact,
    marginBottom: SPACING.md,
    textAlign: "center",
    color: COLORS.text,
  },
  text: {
    fontSize: 16,
    marginBottom: SPACING.xl,
    textAlign: "center",
    color: COLORS.text,
  },
  button: {
    backgroundColor: COLORS.primary,
    padding: SPACING.md,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  pollingBlock: {
    marginTop: SPACING.lg,
    alignItems: "center",
    gap: SPACING.sm,
  },
  hint: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
});

