import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Linking,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useShallow } from "zustand/react/shallow";

import { Button } from "@/shared/components/ui";
import { hapticFeedback } from "@/shared/lib/utils/haptics";

import { useAuthStore } from "@/shared/stores";
import { API_BASE_URL, COLORS, SPACING, FONTS } from "@/constants";

const TELEGRAM_BOT_URL = "https://t.me/dog_trainer_register_bot";
const POLL_INTERVAL_MS = 5000;

export default function ConfirmScreen() {
  const router = useRouter();
  const { pendingConfirmPhone, clearPendingConfirmPhone, checkAuth, logout } = useAuthStore(
    useShallow((s) => ({
      pendingConfirmPhone: s.pendingConfirmPhone,
      clearPendingConfirmPhone: s.clearPendingConfirmPhone,
      checkAuth: s.checkAuth,
      logout: s.logout,
    })),
  );
  const [isPolling, setIsPolling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const redirectedRef = useRef(false);

  useEffect(() => {
    const phone = pendingConfirmPhone;
    if (!phone) {
      if (!redirectedRef.current) {
        redirectedRef.current = true;
        router.replace("/");
      }
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
          if (intervalRef.current) clearInterval(intervalRef.current);
          redirectedRef.current = true;
          clearPendingConfirmPhone();
          await checkAuth(); // обновляет store (isConfirmed, isAuthenticated)
          router.replace("/"); // с confirm AuthProvider не редиректит — нужен явный переход
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
  }, [pendingConfirmPhone, clearPendingConfirmPhone, checkAuth, router]);

  const handleBackToWelcome = async () => {
    await logout();
    router.replace("/welcome");
  };

  if (!pendingConfirmPhone) return null;

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Подтвердите номер</Text>
        <Text style={styles.text}>
          Откройте Telegram-бота и следуйте инструкциям для подтверждения номера.
        </Text>
        <Pressable
          style={styles.button}
          onPress={() => {
            void hapticFeedback.light();
            void Linking.openURL(TELEGRAM_BOT_URL);
          }}
        >
          <Text style={styles.buttonText}>Открыть Telegram</Text>
        </Pressable>
        {isPolling && (
          <View style={styles.pollingBlock}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.hint}>Ожидаем подтверждения...</Text>
          </View>
        )}

        <View style={styles.altContainer}>
          <Text style={styles.altTitle}>Альтернативный способ подтверждения</Text>
          <Text style={styles.altText}>
            Если у вас нет возможности использовать Telegram, вы вправе подтвердить
            регистрацию по электронной почте. Направьте письмо с темой
            «Подтверждение аккаунта» и указанием вашего имени пользователя в приложении на адрес:
          </Text>
          <Pressable
            onPress={() => {
              void hapticFeedback.light();
              void Linking.openURL(
                "mailto:asmtv1@yandex.ru?subject=%D0%9F%D0%BE%D0%B4%D1%82%D0%B2%D0%B5%D1%80%D0%B6%D0%B4%D0%B5%D0%BD%D0%B8%D0%B5+%D0%B0%D0%BA%D0%BA%D0%B0%D1%83%D0%BD%D1%82%D0%B0&body=%D0%9C%D0%BE%D1%91+%D0%B8%D0%BC%D1%8F+%D0%BF%D0%BE%D0%BB%D1%8C%D0%B7%D0%BE%D0%B2%D0%B0%D1%82%D0%B5%D0%BB%D1%8F%3A+",
              );
            }}
          >
            <Text style={styles.altEmail}>asmtv1@yandex.ru</Text>
          </Pressable>
          <Text style={styles.altText}>
            Аккаунт будет активирован администратором в течение 24 часов.
          </Text>
        </View>

        <View style={styles.navButtons}>
          <Button
            label="На стартовую"
            variant="primary"
            onPress={handleBackToWelcome}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    padding: SPACING.lg,
    justifyContent: "center",
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
  altContainer: {
    marginTop: SPACING.xl,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    alignItems: "center",
    gap: SPACING.sm,
  },
  altTitle: {
    fontSize: 14,
    fontFamily: FONTS.montserratBold,
    color: COLORS.text,
    textAlign: "center",
  },
  altText: {
    fontSize: 12,
    fontFamily: FONTS.montserrat,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  altEmail: {
    fontSize: 13,
    fontFamily: FONTS.montserrat,
    color: COLORS.secondary,
    textDecorationLine: "underline",
    textAlign: "center",
  },
  navButtons: {
    marginTop: SPACING.xxl,
    gap: SPACING.md,
  },
});

