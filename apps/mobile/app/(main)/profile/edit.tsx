import { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { Text, Snackbar } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button, Input } from "@/shared/components/ui";
import { useAuthStore } from "@/shared/stores";
import { userApi, type UpdateProfileData } from "@/shared/lib/api";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { COLORS, SPACING } from "@/constants";

/**
 * Экран редактирования профиля
 */
export default function EditProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, setUser } = useAuthStore();

  const [form, setForm] = useState<UpdateProfileData>({
    fullName: "",
    about: "",
    telegram: "",
    instagram: "",
    website: "",
  });
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

  // Инициализация формы данными пользователя
  useEffect(() => {
    if (user) {
      setForm({
        fullName: user.name || "",
        about: "",
        telegram: "",
        instagram: "",
        website: "",
      });
    }
  }, [user]);

  // Мутация обновления профиля
  const updateMutation = useMutation({
    mutationFn: userApi.updateProfile,
    onSuccess: (result) => {
      if (result.success && result.data) {
        setUser(result.data);
        hapticFeedback.success();
        setSnackbar({ visible: true, message: "Профиль обновлён" });
        setTimeout(() => router.back(), 1000);
      } else {
        setSnackbar({ visible: true, message: result.error || "Ошибка сохранения" });
      }
    },
    onError: () => {
      setSnackbar({ visible: true, message: "Ошибка подключения" });
    },
  });

  const updateField = (field: keyof UpdateProfileData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    updateMutation.mutate(form);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Редактировать профиль",
        }}
      />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Основная информация */}
            <View style={styles.section}>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Основная информация
              </Text>

              <Input
                label="Полное имя"
                value={form.fullName}
                onChangeText={(v) => updateField("fullName", v)}
                autoCapitalize="words"
              />

              <Input
                label="О себе"
                value={form.about}
                onChangeText={(v) => updateField("about", v)}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Социальные сети */}
            <View style={styles.section}>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Социальные сети
              </Text>

              <Input
                label="Telegram"
                value={form.telegram}
                onChangeText={(v) => updateField("telegram", v)}
                autoCapitalize="none"
                left={<Text style={styles.inputPrefix}>@</Text>}
              />

              <Input
                label="Instagram"
                value={form.instagram}
                onChangeText={(v) => updateField("instagram", v)}
                autoCapitalize="none"
                left={<Text style={styles.inputPrefix}>@</Text>}
              />

              <Input
                label="Веб-сайт"
                value={form.website}
                onChangeText={(v) => updateField("website", v)}
                autoCapitalize="none"
                keyboardType="url"
              />
            </View>

            {/* Кнопки */}
            <View style={styles.actions}>
              <Button
                label="Отмена"
                mode="outlined"
                onPress={() => router.back()}
                style={styles.button}
              />
              <Button
                label="Сохранить"
                onPress={handleSave}
                loading={updateMutation.isPending}
                disabled={updateMutation.isPending}
                style={styles.button}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        <Snackbar
          visible={snackbar.visible}
          onDismiss={() => setSnackbar({ visible: false, message: "" })}
          duration={2000}
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
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.md,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontWeight: "600",
    marginBottom: SPACING.md,
  },
  inputPrefix: {
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
  },
  actions: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  button: {
    flex: 1,
  },
});
