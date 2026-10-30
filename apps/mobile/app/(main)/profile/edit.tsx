import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from "react-native";
import { Text, Snackbar } from "react-native-paper";
import { AppBackButton, TexturedSafeAreaView as SafeAreaView } from "@/shared/components";
import { Stack, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  normalizeTelegramInput,
  normalizeInstagramInput,
  normalizeWebsiteUrl,
} from "@gafus/core-client/utils/social";

import { BORDER_RADIUS, COLORS, FONTS, SPACING } from "@/shared/config";
import { Button, Loading } from "@/shared/components/ui";
import { userApi, type UpdateProfileData } from "@/shared/lib/api";
import {
  formatIsoBirthDateToDdMmYyyy,
  validateOptionalProfileBirthDateInput,
} from "@/shared/lib/utils/birthDateInput";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { useAuthStore } from "@/shared/stores";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import {
  changedProfileFields,
  exactProfileReadbackMatches,
} from "@/features/profile/profile-edit-changed-fields";
import { reportClientError } from "@/shared/lib/tracer";

const editProfileSchema = z.object({
  fullName: z.string().trim().max(120),
  city: z.string().trim().max(100, "Не более 100 символов"),
  about: z.string().trim().max(2000),
  telegram: z.string().trim().max(100),
  instagram: z.string().trim().max(100),
  website: z.string().trim().max(200),
  birthDate: z.string().trim().max(100),
});

function mapProfileToForm(profile: {
  fullName?: string | null;
  city?: string | null;
  about?: string | null;
  telegram?: string | null;
  instagram?: string | null;
  website?: string | null;
  birthDate?: string | null;
}): UpdateProfileData {
  return {
    fullName: profile.fullName || "",
    city: profile.city || "",
    birthDate: formatIsoBirthDateToDdMmYyyy(profile.birthDate ?? ""),
    about: profile.about || "",
    telegram: profile.telegram || "",
    instagram: profile.instagram || "",
    website: profile.website || "",
  };
}

type ProfileActor = { ownerId: string; authEpoch: string };
const PROFILE_UNKNOWN =
  "Результат сохранения неизвестен. Проверьте профиль перед повторной попыткой.";
const PROFILE_REJECTED = "Не удалось сохранить профиль. Проверьте заполненные поля.";

/**
 * Редактирование «О себе» — тот же визуальный паттерн, что экран «Напоминания»
 */
export default function EditProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const setUserProfile = useAuthStore((s) => s.setUserProfile);
  const loggedOwner = useAuthStore((s) =>
    s.isAuthenticated && !s.isLoading ? (s.user?.id ?? null) : null,
  );
  const verifiedBinding = newOnlyV2NativeQueues.getVerifiedBinding();
  const epoch = verifiedBinding?.principalId === loggedOwner ? verifiedBinding.authEpoch : null;
  const actor: ProfileActor | null =
    loggedOwner && epoch ? { ownerId: loggedOwner, authEpoch: epoch } : null;
  const isMounted = useRef(true);
  const inFlight = useRef(false);
  const [resultUnknown, setResultUnknown] = useState(false);
  const currentActor = (captured: ProfileActor | null) => {
    const state = useAuthStore.getState();
    const binding = newOnlyV2NativeQueues.getVerifiedBinding();
    return (
      !!captured &&
      isMounted.current &&
      state.isAuthenticated &&
      !state.isLoading &&
      state.user?.id === captured.ownerId &&
      binding?.principalId === captured.ownerId &&
      binding.authEpoch === captured.authEpoch
    );
  };
  const backTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const returnToProfile = useCallback(() => {
    if (backTimer.current !== null) {
      clearTimeout(backTimer.current);
      backTimer.current = null;
    }
    if (router.canGoBack()) router.back();
    else router.replace("/(main)/(tabs)/profile");
  }, [router]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (backTimer.current !== null) clearTimeout(backTimer.current);
    };
  }, []);

  const [form, setForm] = useState<UpdateProfileData>({
    fullName: "",
    city: "",
    about: "",
    telegram: "",
    instagram: "",
    website: "",
    birthDate: "",
  });
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

  const {
    data: profileData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["user-profile", actor?.ownerId ?? null, actor?.authEpoch ?? null],
    enabled: !!actor,
    retry: false,
    queryFn: async () => {
      const captured = actor;
      if (!currentActor(captured)) throw new Error("PROFILE_SESSION_CHANGED");
      const res = await userApi.getProfile(() => currentActor(captured));
      if (!currentActor(captured)) throw new Error("PROFILE_SESSION_CHANGED");
      if (!res.success || !res.data || res.data.id !== captured?.ownerId)
        throw new Error("PROFILE_READ_UNKNOWN");
      return res.data;
    },
  });

  useEffect(() => {
    const binding = newOnlyV2NativeQueues.getVerifiedBinding();
    if (
      profileData &&
      loggedOwner &&
      epoch &&
      profileData.id === loggedOwner &&
      binding?.principalId === loggedOwner &&
      binding.authEpoch === epoch &&
      isMounted.current
    ) {
      setForm(mapProfileToForm(profileData.profile ?? {}));
    }
  }, [profileData, loggedOwner, epoch]);

  const updateMutation = useMutation({
    mutationFn: async ({
      captured,
      changes,
    }: {
      captured: ProfileActor;
      changes: UpdateProfileData;
    }): Promise<{
      status: "confirmed" | "rejected" | "unknown" | "stale";
      profile?: NonNullable<typeof profileData>["profile"];
    }> => {
      try {
        if (!currentActor(captured)) return { status: "stale" };
        const ack = await userApi.updateProfile(changes, () => currentActor(captured));
        if (!currentActor(captured)) return { status: "stale" };
        if (!ack.success) {
          const rejected = [
            "VALIDATION_ERROR",
            // Original registered user/profile Hono reports structured 400 under this code.
            "PROFILE_VALIDATION_ERROR",
            "BAD_REQUEST",
            "FORBIDDEN",
            "SESSION_EXPIRED",
            "UNAUTHORIZED",
          ];
          return { status: ack.code && rejected.includes(ack.code) ? "rejected" : "unknown" };
        }
        if (!ack.data || ack.data.userId !== captured.ownerId) return { status: "unknown" };
        const readback = await userApi.getProfile(() => currentActor(captured));
        if (!currentActor(captured)) return { status: "stale" };
        if (
          !readback.success ||
          !readback.data ||
          readback.data.id !== captured.ownerId ||
          !exactProfileReadbackMatches(changes, readback.data.profile)
        )
          return { status: "unknown" };
        queryClient.setQueryData(
          ["user-profile", captured.ownerId, captured.authEpoch],
          readback.data,
        );
        return { status: "confirmed", profile: readback.data.profile };
      } catch {
        // Never send raw profile payload / contact info / HTTP error body to tracer.
        reportClientError(new Error("PROFILE_EDIT_ACK_OR_READBACK_UNKNOWN"), {
          issueKey: "ProfileEditScreen",
          keys: { operation: "update_and_readback" },
        });
        return { status: currentActor(captured) ? "unknown" : "stale" };
      }
    },
    onSuccess: (result, variables) => {
      if (!currentActor(variables.captured)) return;
      if (result.status === "confirmed" && result.profile) {
        setUserProfile({ ...result.profile, userId: variables.captured.ownerId });
        void queryClient.invalidateQueries({ queryKey: ["public-profile"] });
        void queryClient.invalidateQueries({ queryKey: ["trainer-public-profile"] });
        void hapticFeedback.success();
        setSnackbar({ visible: true, message: "Профиль обновлён" });
        if (backTimer.current !== null) clearTimeout(backTimer.current);
        backTimer.current = setTimeout(() => {
          if (currentActor(variables.captured)) returnToProfile();
        }, 1000);
      } else if (result.status === "rejected") {
        setSnackbar({ visible: true, message: PROFILE_REJECTED });
      } else if (result.status === "unknown") {
        setResultUnknown(true);
        setSnackbar({ visible: true, message: PROFILE_UNKNOWN });
      }
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });

  const updateField = (field: keyof UpdateProfileData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    if (
      inFlight.current ||
      resultUnknown ||
      !actor ||
      !currentActor(actor) ||
      !profileData ||
      profileData.id !== actor.ownerId
    )
      return;
    const birthRaw = (form.birthDate ?? "").trim();
    const birthCheck = validateOptionalProfileBirthDateInput(birthRaw);
    if (!birthCheck.ok) {
      setSnackbar({ visible: true, message: birthCheck.message });
      return;
    }

    const normalized = {
      ...form,
      fullName: (form.fullName ?? "").trim(),
      city: (form.city ?? "").trim(),
      about: (form.about ?? "").trim(),
      telegram: (form.telegram ?? "").trim().replace(/^@/, ""),
      instagram: (form.instagram ?? "").trim().replace(/^@/, ""),
      website: (form.website ?? "").trim(),
      birthDate: birthCheck.apiValue,
    };

    const parsed = editProfileSchema.safeParse(normalized);
    if (!parsed.success) {
      setSnackbar({
        visible: true,
        message: parsed.error.issues[0]?.message ?? "Проверьте заполнение формы",
      });
      return;
    }

    let canonical = parsed.data;
    try {
      canonical = {
        ...parsed.data,
        telegram: normalizeTelegramInput(parsed.data.telegram),
        instagram: normalizeInstagramInput(parsed.data.instagram),
        website: normalizeWebsiteUrl(parsed.data.website),
      };
    } catch {
      reportClientError(new Error("PROFILE_CONTACT_FIELD_INVALID"), {
        issueKey: "ProfileEditScreen",
        severity: "notice",
        keys: { operation: "validate_social_input" },
      });
      setSnackbar({
        visible: true,
        message: "Проверьте адрес сайта или имя пользователя в контактах",
      });
      return;
    }
    const changes = changedProfileFields(profileData.profile ?? {}, canonical);
    if (Object.keys(changes).length === 0) {
      returnToProfile();
      return;
    }
    inFlight.current = true;
    updateMutation.mutate({ captured: actor, changes });
  };

  const handleBack = () => {
    void hapticFeedback.light();
    returnToProfile();
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <AppBackButton style={styles.backRow} onPress={handleBack} />

        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          {!actor ? (
            <ScrollView contentContainerStyle={styles.scrollContent}>
              <Text style={styles.errorInline}>
                Для редактирования нужна подтверждённая сессия.
              </Text>
            </ScrollView>
          ) : isLoading ? (
            <Loading fullScreen embedded message="Загрузка профиля…" />
          ) : error ? (
            <ScrollView contentContainerStyle={styles.scrollContent}>
              <View style={styles.formCard}>
                <Text style={styles.screenTitle}>О себе</Text>
                <Text style={styles.errorInline}>
                  {error instanceof Error ? error.message : "Не удалось загрузить профиль"}
                </Text>
                <AppBackButton onPress={handleBack} />
              </View>
            </ScrollView>
          ) : (
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.formCard}>
                <Text style={styles.screenTitle}>О себе</Text>

                <Text style={styles.sectionHeading}>Основная информация</Text>

                <Text style={styles.fieldLabel}>Имя и фамилия</Text>
                <TextInput
                  value={form.fullName || ""}
                  onChangeText={(v) => updateField("fullName", v)}
                  style={styles.input}
                  placeholder="Имя и фамилия"
                  placeholderTextColor={COLORS.disabled}
                  autoCapitalize="words"
                />

                <Text style={styles.fieldLabel}>Город</Text>
                <TextInput
                  value={form.city || ""}
                  onChangeText={(v) => updateField("city", v)}
                  style={styles.input}
                  placeholder="Например, Самара"
                  placeholderTextColor={COLORS.disabled}
                  autoCapitalize="words"
                  maxLength={100}
                />
                <Text style={styles.hintText}>
                  Необязательно. Город будет виден в публичном профиле.
                </Text>

                <Text style={styles.fieldLabel}>Дата рождения</Text>
                <TextInput
                  value={form.birthDate || ""}
                  onChangeText={(v) => updateField("birthDate", v)}
                  style={styles.input}
                  placeholder="ДД.ММ.ГГГГ"
                  placeholderTextColor={COLORS.disabled}
                  keyboardType="numbers-and-punctuation"
                />
                <Text style={styles.hintText}>Формат: ДД.ММ.ГГГГ</Text>

                <Text style={styles.fieldLabel}>Заметки о себе</Text>
                <TextInput
                  value={form.about || ""}
                  onChangeText={(v) => updateField("about", v)}
                  style={[styles.input, styles.inputMultiline]}
                  placeholder="О себе"
                  placeholderTextColor={COLORS.disabled}
                  multiline
                  textAlignVertical="top"
                />

                <Text style={[styles.sectionHeading, styles.sectionHeadingSpaced]}>Контакты</Text>

                <Text style={styles.fieldLabel}>Телеграм</Text>
                <TextInput
                  value={form.telegram || ""}
                  onChangeText={(v) => updateField("telegram", v)}
                  style={styles.input}
                  placeholder="username без @"
                  placeholderTextColor={COLORS.disabled}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.hintText}>
                  Минимум 5 символов: латиница, цифры, подчёркивание.
                </Text>

                <Text style={styles.fieldLabel}>Instagram</Text>
                <TextInput
                  value={form.instagram || ""}
                  onChangeText={(v) => updateField("instagram", v)}
                  style={styles.input}
                  placeholder="username без @"
                  placeholderTextColor={COLORS.disabled}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.hintText}>
                  До 30 символов: латиница, цифры, точка, подчёркивание.
                </Text>

                <Text style={styles.fieldLabel}>YouTube или сайт</Text>
                <TextInput
                  value={form.website || ""}
                  onChangeText={(v) => updateField("website", v)}
                  style={styles.input}
                  placeholder="youtube.com/@… или example.com"
                  placeholderTextColor={COLORS.disabled}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                <Text style={styles.hintText}>
                  YouTube или сайт. Можно без https:// и www — добавятся автоматически.
                </Text>

                {resultUnknown ? <Text style={styles.errorInline}>{PROFILE_UNKNOWN}</Text> : null}
                <View style={styles.actionsRow}>
                  <Button
                    label="Отмена"
                    variant="secondary"
                    flex={1}
                    fullWidth={false}
                    height={52}
                    animatedPress
                    haptic={false}
                    onPress={handleBack}
                    disabled={updateMutation.isPending}
                    accessibilityHint="Закрывает экран без сохранения изменений"
                  />
                  <Button
                    label={updateMutation.isPending ? "Сохранение…" : "Сохранить"}
                    flex={1}
                    fullWidth={false}
                    height={52}
                    animatedPress
                    onPress={handleSave}
                    loading={updateMutation.isPending}
                    disabled={updateMutation.isPending || resultUnknown || !actor}
                  />
                </View>
              </View>
            </ScrollView>
          )}
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
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: 4,
  },
  backText: {
    fontSize: 17,
    color: COLORS.primary,
    fontWeight: "500",
  },
  scrollContent: {
    padding: SPACING.md,
    paddingTop: 0,
    paddingBottom: SPACING.xl,
  },
  formCard: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  screenTitle: {
    fontSize: 24,
    fontFamily: FONTS.impact,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: "700",
    fontFamily: FONTS.impact,
    color: COLORS.text,
    marginTop: SPACING.xs,
  },
  sectionHeadingSpaced: {
    marginTop: SPACING.md,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
    marginTop: 4,
  },
  hintText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
    marginTop: 2,
    marginBottom: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D4C4A8",
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: "#FFF",
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
    fontSize: 14,
  },
  inputMultiline: {
    minHeight: 100,
    paddingTop: Platform.OS === "ios" ? 12 : 10,
  },
  errorInline: {
    fontSize: 14,
    color: COLORS.error,
    fontFamily: FONTS.montserrat,
    marginBottom: SPACING.sm,
  },
  actionsRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  secondaryButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    backgroundColor: "transparent",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
  },
});
