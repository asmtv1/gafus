import { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { Text, Snackbar, HelperText } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, Input } from "@/shared/components/ui";
import { useAuthStore } from "@/shared/stores";
import { userApi, type UpdateProfileData } from "@/shared/lib/api";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { COLORS, SPACING } from "@/constants";

/**
 * Функция для преобразования профиля в данные формы (как в веб-версии)
 */
function mapProfileToForm(profile: {
  fullName?: string | null;
  about?: string | null;
  telegram?: string | null;
  instagram?: string | null;
  website?: string | null;
  birthDate?: string | null;
}): UpdateProfileData {
  return {
    fullName: profile.fullName || "",
    birthDate: profile.birthDate ? new Date(profile.birthDate).toISOString().split("T")[0] : "",
    about: profile.about || "",
    telegram: profile.telegram || "",
    instagram: profile.instagram || "",
    website: profile.website || "",
  };
}

/**
 * Экран редактирования профиля (логика как в веб-версии)
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
    birthDate: "",
  });
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

  // Загрузка профиля (как в веб-версии через fetchProfile)
  const {
    data: profileData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["user-profile"],
    queryFn: () => userApi.getProfile(),
  });

  // Инициализация формы данными из профиля (как в веб-версии)
  useEffect(() => {
    if (profileData?.success && profileData.data?.profile) {
      const profile = profileData.data.profile;
      setForm(mapProfileToForm(profile));
    }
  }, [profileData]);

  // Мутация обновления профиля
  const updateMutation = useMutation({
    mutationFn: userApi.updateProfile,
    onSuccess: (result) => {
      if (result.success && result.data) {
        setUser(result.data);
        // Инвалидируем кэш профиля (как в веб-версии через clearProfilePageCache)
        queryClient.invalidateQueries({ queryKey: ["user-profile"] });
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

  // Показываем загрузку пока профиль загружается
  if (isLoading) {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown: true,
            title: "Редактировать «О себе»",
          }}
        />
        <SafeAreaView style={styles.container} edges={["bottom"]}>
          <View style={styles.loadingContainer}>
            <Text variant="titleLarge" style={styles.loadingTitle}>
              Редактировать «О себе»
            </Text>
            <Text style={styles.loadingText}>Загрузка профиля...</Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  // Показываем ошибку если не удалось загрузить профиль
  if (error) {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown: true,
            title: "Редактировать «О себе»",
          }}
        />
        <SafeAreaView style={styles.container} edges={["bottom"]}>
          <View style={styles.loadingContainer}>
            <Text variant="titleLarge" style={styles.loadingTitle}>
              Редактировать «О себе»
            </Text>
            <Text style={[styles.loadingText, styles.errorText]}>
              Ошибка загрузки профиля:{" "}
              {error instanceof Error ? error.message : "Неизвестная ошибка"}
            </Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Редактировать «О себе»",
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
            <Text variant="titleLarge" style={styles.title}>
              Редактировать «О себе»
            </Text>

            {/* Основная информация */}
            <View style={styles.section}>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Основная информация
              </Text>

              <Input
                label="Имя и фамилия"
                placeholder="Имя и фамилия"
                value={form.fullName || ""}
                onChangeText={(v) => updateField("fullName", v)}
                autoCapitalize="words"
              />

              <View style={styles.inputWrapper}>
                <Input
                  label="Дата рождения"
                  placeholder="YYYY-MM-DD"
                  value={form.birthDate || ""}
                  onChangeText={(v) => updateField("birthDate", v)}
                  keyboardType="default"
                />
              </View>

              <Input
                label="Заметки о себе"
                placeholder="О себе"
                value={form.about || ""}
                onChangeText={(v) => updateField("about", v)}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Контактная информация */}
            <View style={styles.section}>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Контактная информация
              </Text>

              <View style={styles.inputWrapper}>
                <Input
                  label="Telegram для связи"
                  placeholder="asmtv1"
                  value={form.telegram || ""}
                  onChangeText={(v) => updateField("telegram", v)}
                  autoCapitalize="none"
                />
                <HelperText type="info" visible={true} style={styles.helperText}>
                  Введите username без @ (например: asmtv1). Минимум 5 символов, только латинские
                  буквы, цифры и подчеркивание.
                </HelperText>
              </View>

              <View style={styles.inputWrapper}>
                <Input
                  label="Ваш Instagram"
                  placeholder="doghandler_lana"
                  value={form.instagram || ""}
                  onChangeText={(v) => updateField("instagram", v)}
                  autoCapitalize="none"
                />
                <HelperText type="info" visible={true} style={styles.helperText}>
                  Введите username без @ (например: doghandler_lana). До 30 символов, только
                  латинские буквы, цифры, точки и подчеркивание.
                </HelperText>
              </View>

              <View style={styles.inputWrapper}>
                <Input
                  label="YouTube или сайт"
                  placeholder="youtube.com/@username или example.com"
                  value={form.website || ""}
                  onChangeText={(v) => updateField("website", v)}
                  autoCapitalize="none"
                  keyboardType="url"
                />
                <HelperText type="info" visible={true} style={styles.helperText}>
                  Введите URL сайта или канала YouTube. Можно без https:// и www - они добавятся
                  автоматически.
                </HelperText>
              </View>
            </View>

            {/* Кнопки */}
            <View style={styles.actions}>
              <Button
                label="Вернуться без сохранения"
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
  title: {
    marginBottom: SPACING.lg,
    fontWeight: "400",
    color: COLORS.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  loadingTitle: {
    marginBottom: SPACING.md,
    fontWeight: "400",
    color: COLORS.text,
  },
  loadingText: {
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  errorText: {
    color: COLORS.error,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontWeight: "600",
    marginBottom: SPACING.md,
    color: COLORS.text,
  },
  inputWrapper: {
    marginBottom: SPACING.sm,
  },
  helperText: {
    marginTop: -SPACING.xs,
    marginBottom: SPACING.sm,
    fontSize: 12,
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
