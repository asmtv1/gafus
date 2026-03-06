import { useState } from "react";
import { StyleSheet, ScrollView } from "react-native";
import { Text, Snackbar } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { parsePhoneNumberFromString } from "libphonenumber-js";

import { Button, Input } from "@/shared/components/ui";
import { useAuthStore } from "@/shared/stores";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { COLORS, SPACING } from "@/constants";

export default function VkSetPhoneScreen() {
  const { setVkPhoneComplete } = useAuthStore();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

  const onSubmit = async () => {
    const trimmed = phone.trim();
    if (!trimmed) {
      setSnackbar({ visible: true, message: "Введите номер телефона" });
      return;
    }
    const parsedPhone = parsePhoneNumberFromString(trimmed, "RU");
    if (!parsedPhone?.isValid()) {
      setSnackbar({ visible: true, message: "Неверный формат номера телефона" });
      return;
    }
    const formattedPhone = parsedPhone.format("E.164");
    setLoading(true);
    setSnackbar({ visible: false, message: "" });
    const result = await setVkPhoneComplete(formattedPhone);
    setLoading(false);
    if (result.success) {
      hapticFeedback.success();
      // AuthProvider перенаправит при pendingVkPhone → false
    } else {
      setSnackbar({ visible: true, message: result.error || "Не удалось установить номер" });
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text variant="titleLarge" style={styles.title}>
          Установка номера телефона
        </Text>
        <Text variant="bodyLarge" style={styles.hint}>
          Для завершения регистрации укажите номер телефона.
        </Text>
        <Input
          label="Номер телефона"
          value={phone}
          onChangeText={setPhone}
          placeholder="+7 (999) 123-45-67"
          keyboardType="phone-pad"
          style={styles.input}
        />
        <Button
          label="Продолжить"
          onPress={onSubmit}
          loading={loading}
          disabled={loading}
          style={styles.button}
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
  },
  title: {
    marginBottom: SPACING.md,
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
