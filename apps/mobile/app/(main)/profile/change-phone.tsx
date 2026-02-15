import { useState } from "react";
import { StyleSheet, ScrollView } from "react-native";
import { Text, Snackbar } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";

import { Button, Input } from "@/shared/components/ui";
import { userApi } from "@/shared/lib/api/user";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { COLORS, SPACING } from "@/constants";

export default function ChangePhoneScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

  const onRequestCode = async () => {
    setLoading(true);
    setSnackbar({ visible: false, message: "" });
    try {
      const result = await userApi.requestPhoneChange();
      if (result.success) {
        hapticFeedback.success();
        setSnackbar({ visible: true, message: "Код отправлен в Telegram" });
        setStep(2);
      } else {
        setSnackbar({ visible: true, message: result.error || "Ошибка запроса кода" });
      }
    } catch {
      setSnackbar({ visible: true, message: "Ошибка подключения" });
    } finally {
      setLoading(false);
    }
  };

  const onConfirm = async () => {
    const trimmedCode = code.trim();
    const trimmedPhone = newPhone.trim();
    if (!trimmedCode || trimmedCode.length !== 6 || !/^\d{6}$/.test(trimmedCode)) {
      setSnackbar({ visible: true, message: "Введите 6-значный код" });
      return;
    }
    if (!trimmedPhone) {
      setSnackbar({ visible: true, message: "Введите новый номер телефона" });
      return;
    }
    setLoading(true);
    setSnackbar({ visible: false, message: "" });
    try {
      const result = await userApi.confirmPhoneChange(trimmedCode, trimmedPhone);
      if (result.success) {
        hapticFeedback.success();
        queryClient.invalidateQueries({ queryKey: ["user-profile"] });
        setSnackbar({ visible: true, message: "Номер изменён" });
        setTimeout(() => router.back(), 1000);
      } else {
        setSnackbar({ visible: true, message: result.error || "Не удалось сменить номер" });
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
        {step === 1 && (
          <>
            <Text variant="bodyLarge" style={styles.hint}>
              Код подтверждения будет отправлен в Telegram, привязанный к аккаунту.
            </Text>
            <Button
              mode="contained"
              onPress={onRequestCode}
              loading={loading}
              disabled={loading}
              style={styles.button}
            >
              Отправить код в Telegram
            </Button>
          </>
        )}
        {step === 2 && (
          <>
            <Text variant="bodyLarge" style={styles.hint}>
              Введите 6-значный код из Telegram и новый номер телефона.
            </Text>
            <Input
              label="Код из Telegram"
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              keyboardType="number-pad"
              maxLength={6}
              style={styles.input}
            />
            <Input
              label="Новый номер телефона"
              value={newPhone}
              onChangeText={setNewPhone}
              placeholder="+7 (999) 123-45-67"
              keyboardType="phone-pad"
              style={styles.input}
            />
            <Button
              mode="contained"
              onPress={onConfirm}
              loading={loading}
              disabled={loading}
              style={styles.button}
            >
              Подтвердить
            </Button>
          </>
        )}
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
