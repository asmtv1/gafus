import { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from "react-native";
import { Text } from "react-native-paper";
import { AppBackButton, TexturedSafeAreaView as SafeAreaView } from "@/shared/components";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";

import { BORDER_RADIUS, COLORS, FONTS, SPACING } from "@/shared/config";
import { validatePetForm, type PetFormErrors } from "@/features/pets";
import { Button, Loading } from "@/shared/components/ui";
import {
  parsePetKind,
  petsApi,
  type UpdatePetData,
  type PetKind,
  type Pet,
} from "@/shared/lib/api";
import { formatIsoBirthDateToDdMmYyyy } from "@/shared/lib/utils/birthDateInput";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { reportClientError } from "@/shared/lib/tracer";
import { useAuthStore } from "@/shared/stores/authStore";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { getPetEditChanges, matchesPetEditReadback } from "@/features/pets/pet-edit-changed-fields";
import { petEditServerErrors } from "@/features/pets/pet-edit-field-errors";
import { validatedPetDetailForActor } from "@/shared/lib/api/petsReadValidation";

type EditActor = { ownerId: string; authEpoch: string };
const UNKNOWN_MESSAGE =
  "Результат сохранения неизвестен. Не повторяйте запрос без проверки данных.";
const REJECTED_MESSAGE = "Не удалось сохранить. Проверьте введённые данные.";

const PET_TYPES = [
  {
    value: "DOG" as const,
    label: "Собака",
    image: require("../../../../assets/images/pet-type-dog.webp"),
  },
  {
    value: "CAT" as const,
    label: "Кошка",
    image: require("../../../../assets/images/pet-type-cat.webp"),
  },
];

/**
 * Редактировать питомца — тот же визуальный паттерн, что «Напоминания» / «О себе»
 */
export default function EditPetScreen() {
  const rawId = useLocalSearchParams<{ id: string | string[] }>().id;
  const petId = typeof rawId === "string" ? rawId : (rawId?.[0] ?? "");
  const authenticatedOwner = useAuthStore((state) =>
    state.isAuthenticated && !state.isLoading ? (state.user?.id ?? null) : null,
  );
  const verifiedBinding = newOnlyV2NativeQueues.getVerifiedBinding();
  const authEpoch =
    verifiedBinding?.principalId === authenticatedOwner ? verifiedBinding.authEpoch : null;
  const actor: EditActor | null =
    authenticatedOwner && authEpoch ? { ownerId: authenticatedOwner, authEpoch } : null;
  return (
    <ScopedPetEditScreen
      key={`${actor?.ownerId ?? "guest"}:${actor?.authEpoch ?? "none"}:${petId}`}
      actor={actor}
      petId={petId}
    />
  );
}
function ScopedPetEditScreen({ petId, actor }: { petId: string; actor: EditActor | null }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isMounted = useRef(true); // Initial query starts before the effect; cleanup fences unmount.
  const writeInFlight = useRef(false);
  const [saveState, setSaveState] = useState<"idle" | "unknown" | "rejected">("idle");
  const [saveMessage, setSaveMessage] = useState("");
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      void queryClient.cancelQueries({
        queryKey: ["pet", petId, actor?.ownerId ?? null, actor?.authEpoch ?? null],
        exact: true,
      });
    };
  }, [queryClient, petId, actor?.ownerId, actor?.authEpoch]);
  const currentActor = (captured: EditActor | null) => {
    const current = newOnlyV2NativeQueues.getVerifiedBinding();
    const auth = useAuthStore.getState();
    const owner = auth.isAuthenticated && !auth.isLoading ? auth.user?.id : null;
    return (
      !!captured &&
      isMounted.current &&
      owner === captured.ownerId &&
      current?.principalId === captured.ownerId &&
      current.authEpoch === captured.authEpoch
    );
  };
  const [name, setName] = useState("");
  const [type, setType] = useState<PetKind>("DOG");
  const [breed, setBreed] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [neckGirthCm, setNeckGirthCm] = useState("");
  const [muzzleGirthCm, setMuzzleGirthCm] = useState("");
  const [bellyGirthCm, setBellyGirthCm] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<PetFormErrors>({});

  const updateField = (
    field: keyof PetFormErrors,
    value: string,
    setter: (value: string) => void,
  ) => {
    setter(value);
    if (errors[field]) {
      setErrors((current) => ({ ...current, [field]: undefined }));
    }
  };

  const {
    data: unverifiedPetData,
    isLoading: isLoadingPet,
    isFetching: isPetFetching,
    isError: isPetReadError,
    error: petReadError,
    refetch: refetchPet,
  } = useQuery({
    queryKey: ["pet", petId, actor?.ownerId ?? null, actor?.authEpoch ?? null],
    queryFn: async () => {
      const captured = actor;
      if (!currentActor(captured)) throw new Error("PET_SESSION_CHANGED");
      const response = await petsApi.getById(petId, () => currentActor(captured));
      if (!currentActor(captured)) throw new Error("PET_SESSION_CHANGED");
      if (!response.success) {
        if (
          response.code === "NOT_FOUND" ||
          response.code === "PET_NOT_FOUND" ||
          response.error === "Питомец не найден"
        )
          throw new Error("PET_DETAIL_NOT_FOUND");
        throw new Error("PET_DETAIL_UNAVAILABLE");
      }
      return validatedPetDetailForActor(response.data, captured!, petId);
    },
    enabled: !!petId && !!actor,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  // QueryClient can contain an optimistic/old payload before the next guarded GET.
  // No raw cache row may populate the form without a fresh owner/DTO check.
  let petData: Pet | undefined;
  if (unverifiedPetData && actor && currentActor(actor)) {
    try {
      petData = validatedPetDetailForActor(unverifiedPetData, actor, petId);
    } catch {
      reportClientError(new Error("PET_DETAIL_CACHE_INVALID"), {
        issueKey: "PetEditScreen",
        keys: { operation: "read_cache_validation" },
      });
    }
  }
  const isPetReadPending = isLoadingPet || (!!unverifiedPetData && !petData && isPetFetching);

  useEffect(() => {
    if (!petData || petData.id !== petId) return;
    setName(petData.name || "");
    setType(parsePetKind(petData.type));
    setBreed(petData.breed || "");
    setBirthDate(formatIsoBirthDateToDdMmYyyy(petData.birthDate ?? ""));
    setHeightCm(petData.heightCm != null ? String(petData.heightCm) : "");
    setNeckGirthCm(petData.neckGirthCm != null ? String(petData.neckGirthCm) : "");
    setMuzzleGirthCm(petData.muzzleGirthCm != null ? String(petData.muzzleGirthCm) : "");
    setBellyGirthCm(petData.bellyGirthCm != null ? String(petData.bellyGirthCm) : "");
    setNotes(petData.notes || "");
    setErrors({});
    setSaveState("idle");
    setSaveMessage("");
  }, [petData, petId, actor?.ownerId, actor?.authEpoch]);

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      changes,
      captured,
    }: {
      id: string;
      changes: UpdatePetData;
      captured: EditActor;
    }): Promise<{
      kind: "confirmed" | "unknown" | "rejected" | "stale";
      message?: string;
      fieldErrors?: PetFormErrors;
    }> => {
      try {
        if (!currentActor(captured)) return { kind: "stale" };
        const response = await petsApi.update(id, changes, () => currentActor(captured));
        if (!currentActor(captured)) return { kind: "stale" };
        if (!response.success) {
          // Explicit server validation (400) and 403/404 are rejections,
          // whereas transport/timeouts or 5xx are uncertain side effects.
          const rejectionCodes = [
            "BAD_REQUEST",
            "VALIDATION_ERROR",
            "PET_VALIDATION_ERROR",
            "FORBIDDEN",
            "NOT_FOUND",
            "PET_NOT_FOUND",
          ];
          if (response.code && rejectionCodes.includes(response.code))
            return {
              kind: "rejected",
              message: REJECTED_MESSAGE,
              fieldErrors: petEditServerErrors(response),
            };
          return { kind: "unknown" };
        }
        if (!response.data || response.data.id !== id) return { kind: "unknown" };
        const readback = await petsApi.getById(id, () => currentActor(captured));
        if (!currentActor(captured)) return { kind: "stale" };
        if (!readback.success || !matchesPetEditReadback(id, changes, readback.data))
          return { kind: "unknown" };
        queryClient.setQueryData(["pet", id, captured.ownerId, captured.authEpoch], readback.data);
        return { kind: "confirmed" };
      } catch {
        // A thrown transport error can contain private pet/owner data.
        // Report a fixed code, never raw error text or request payload.
        reportClientError(new Error("PET_EDIT_ACK_OR_READBACK_UNKNOWN"), {
          issueKey: "PetEditScreen",
          keys: { operation: "update_and_readback" },
        });
        return { kind: currentActor(captured) ? "unknown" : "stale" };
      }
    },
    onSuccess: async (result, variables) => {
      if (!currentActor(variables.captured)) return;
      if (result.kind === "confirmed") {
        await queryClient.invalidateQueries({ queryKey: ["pets"] });
        if (!currentActor(variables.captured)) return;
        void hapticFeedback.success();
        router.back();
      } else if (result.kind === "rejected") {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        setSaveState("rejected");
        setSaveMessage(result.message ?? REJECTED_MESSAGE);
      } else if (result.kind === "unknown") {
        setSaveState("unknown");
        setSaveMessage(UNKNOWN_MESSAGE);
      }
    },
    onSettled: () => {
      writeInFlight.current = false;
    },
  });

  const handleBack = () => {
    void hapticFeedback.light();
    router.back();
  };

  const handleSave = () => {
    if (
      writeInFlight.current ||
      saveState === "unknown" ||
      !petData ||
      !currentActor(actor) ||
      petData.id !== petId
    )
      return;

    const validation = validatePetForm({
      name,
      breed,
      birthDate,
      heightCm,
      neckGirthCm,
      muzzleGirthCm,
      bellyGirthCm,
    });
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }

    setErrors({});
    const draft: UpdatePetData = {
      name: validation.values.name,
      type,
      breed: validation.values.breed,
      birthDate: validation.values.birthDate,
      heightCm: validation.values.heightCm,
      neckGirthCm: validation.values.neckGirthCm,
      muzzleGirthCm: validation.values.muzzleGirthCm,
      bellyGirthCm: validation.values.bellyGirthCm,
      notes: notes.trim(),
    };
    const diff = getPetEditChanges(petData, draft);
    if (!diff.ok) {
      setErrors({ [diff.field]: "Изменение веса доступно только в истории измерений" });
      return;
    }
    if (!Object.keys(diff.changes).length) {
      router.back(); // No changes, no PUT.
      return;
    }
    writeInFlight.current = true;
    setSaveState("idle");
    setSaveMessage("");
    updateMutation.mutate({ id: petId, captured: actor!, changes: diff.changes });
  };

  if (isPetReadPending) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <Loading fullScreen message="Загрузка данных питомца…" />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <AppBackButton style={styles.backRow} onPress={handleBack} />

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          {!petData ? (
            <ScrollView contentContainerStyle={styles.scrollContent}>
              <View style={styles.formCard}>
                <Text style={styles.screenTitle}>Редактировать питомца</Text>
                <Text style={styles.errorInline} accessibilityRole="alert">
                  {!actor
                    ? "Войдите в аккаунт для просмотра питомца."
                    : !petId ||
                        (isPetReadError &&
                          petReadError instanceof Error &&
                          petReadError.message === "PET_DETAIL_NOT_FOUND")
                      ? "Питомец не найден"
                      : "Не удалось загрузить питомца."}
                </Text>
                {isPetReadError &&
                actor &&
                petId &&
                !(
                  petReadError instanceof Error && petReadError.message === "PET_DETAIL_NOT_FOUND"
                ) ? (
                  <Button
                    label="Повторить загрузку питомца"
                    onPress={() => {
                      if (currentActor(actor)) void refetchPet({ cancelRefetch: false });
                    }}
                  />
                ) : null}
                <AppBackButton onPress={handleBack} />
              </View>
            </ScrollView>
          ) : (
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.formCard}>
                <Text style={styles.screenTitle}>Редактировать питомца</Text>

                <Text style={styles.sectionHeading}>Основная информация</Text>

                <Text style={styles.fieldLabel}>Имя питомца *</Text>
                <TextInput
                  value={name}
                  onChangeText={(value) => updateField("name", value, setName)}
                  style={[styles.input, errors.name && styles.inputError]}
                  placeholder="Кличка"
                  placeholderTextColor={COLORS.disabled}
                />
                {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}

                <Text style={styles.fieldLabel}>Тип *</Text>
                <View style={styles.typeRow}>
                  {PET_TYPES.map((t) => (
                    <Button
                      key={t.value}
                      label={t.label}
                      icon={() => (
                        <Image
                          source={t.image}
                          style={{ width: 28, height: 28 }}
                          contentFit="contain"
                          accessible={false}
                        />
                      )}
                      variant={type === t.value ? "selected" : "primary"}
                      flex={1}
                      fullWidth={false}
                      height={52}
                      fontSize={13}
                      lineHeight={18}
                      fontFamily={FONTS.montserratMedium}
                      horizontalPadding={6}
                      verticalPadding={0}
                      borderRadius={12}
                      animatedPress
                      haptic={false}
                      onPress={() => {
                        void hapticFeedback.selection();
                        setType(t.value);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: type === t.value }}
                    />
                  ))}
                </View>

                <Text style={styles.fieldLabel}>Порода *</Text>
                <TextInput
                  value={breed}
                  onChangeText={(value) => updateField("breed", value, setBreed)}
                  style={[styles.input, errors.breed && styles.inputError]}
                  placeholder="Порода"
                  placeholderTextColor={COLORS.disabled}
                />
                {errors.breed ? <Text style={styles.errorText}>{errors.breed}</Text> : null}

                <Text style={styles.fieldLabel}>Дата рождения *</Text>
                <TextInput
                  value={birthDate}
                  onChangeText={(value) => updateField("birthDate", value, setBirthDate)}
                  style={[styles.input, errors.birthDate && styles.inputError]}
                  placeholder="ДД.ММ.ГГГГ"
                  placeholderTextColor={COLORS.disabled}
                  keyboardType="numbers-and-punctuation"
                />
                <Text style={errors.birthDate ? styles.errorText : styles.hintText}>
                  {errors.birthDate ?? "Формат: ДД.ММ.ГГГГ"}
                </Text>

                <Text style={[styles.sectionHeading, styles.sectionHeadingSpaced]}>
                  Физические характеристики
                </Text>

                <Text style={styles.fieldLabel}>Рост (см)</Text>
                <TextInput
                  testID="pet-edit-heightCm"
                  value={heightCm}
                  onChangeText={(value) => updateField("heightCm", value, setHeightCm)}
                  style={[styles.input, errors.heightCm && styles.inputError]}
                  placeholder="Необязательно"
                  placeholderTextColor={COLORS.disabled}
                  keyboardType="decimal-pad"
                />
                {errors.heightCm ? <Text style={styles.errorText}>{errors.heightCm}</Text> : null}

                <Text style={styles.fieldLabel}>Обхват шеи (см)</Text>
                <TextInput
                  testID="pet-edit-neckGirthCm"
                  value={neckGirthCm}
                  onChangeText={(value) => updateField("neckGirthCm", value, setNeckGirthCm)}
                  style={[styles.input, errors.neckGirthCm && styles.inputError]}
                  placeholder="Необязательно"
                  placeholderTextColor={COLORS.disabled}
                  keyboardType="decimal-pad"
                />
                {errors.neckGirthCm ? (
                  <Text style={styles.errorText}>{errors.neckGirthCm}</Text>
                ) : null}

                <Text style={styles.fieldLabel}>Обхват морды (см)</Text>
                <TextInput
                  testID="pet-edit-muzzleGirthCm"
                  value={muzzleGirthCm}
                  onChangeText={(value) => updateField("muzzleGirthCm", value, setMuzzleGirthCm)}
                  style={[styles.input, errors.muzzleGirthCm && styles.inputError]}
                  placeholder="Необязательно"
                  placeholderTextColor={COLORS.disabled}
                  keyboardType="decimal-pad"
                />
                {errors.muzzleGirthCm ? (
                  <Text style={styles.errorText}>{errors.muzzleGirthCm}</Text>
                ) : null}

                <Text style={styles.fieldLabel}>Обхват живота (см)</Text>
                <TextInput
                  testID="pet-edit-bellyGirthCm"
                  value={bellyGirthCm}
                  onChangeText={(value) => updateField("bellyGirthCm", value, setBellyGirthCm)}
                  style={[styles.input, errors.bellyGirthCm && styles.inputError]}
                  placeholder="Необязательно"
                  placeholderTextColor={COLORS.disabled}
                  keyboardType="decimal-pad"
                />
                {errors.bellyGirthCm ? (
                  <Text style={styles.errorText}>{errors.bellyGirthCm}</Text>
                ) : null}

                <Text style={[styles.sectionHeading, styles.sectionHeadingSpaced]}>
                  Дополнительно
                </Text>

                <Text style={styles.fieldLabel}>Заметки</Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  style={[styles.input, styles.inputMultiline]}
                  placeholder="Заметки о питомце"
                  placeholderTextColor={COLORS.disabled}
                  multiline
                  textAlignVertical="top"
                />

                {saveMessage ? <Text style={styles.errorInline}>{saveMessage}</Text> : null}
                {saveState === "unknown" ? (
                  <Text style={styles.hintText}>
                    Откройте питомца заново, чтобы проверить результат. Автоматического повторного
                    PUT нет.
                  </Text>
                ) : null}
                <View style={styles.actionsRow}>
                  <Button
                    label="Отмена"
                    variant="secondary"
                    flex={1}
                    fullWidth={false}
                    height={48}
                    fontFamily={FONTS.montserrat}
                    fontWeight="600"
                    fontSize={15}
                    lineHeight={20}
                    horizontalPadding={0}
                    verticalPadding={14}
                    borderRadius={10}
                    onPress={handleBack}
                    disabled={updateMutation.isPending}
                  />
                  <Button
                    label={updateMutation.isPending ? "Сохранение…" : "Сохранить"}
                    flex={1}
                    fullWidth={false}
                    height={48}
                    fontFamily={FONTS.montserrat}
                    fontWeight="600"
                    fontSize={15}
                    lineHeight={20}
                    horizontalPadding={0}
                    verticalPadding={14}
                    borderRadius={10}
                    onPress={handleSave}
                    disabled={updateMutation.isPending || saveState === "unknown" || !actor}
                  />
                </View>
              </View>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
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
  errorInline: {
    fontSize: 14,
    color: COLORS.error,
    fontFamily: FONTS.montserrat,
    marginBottom: SPACING.sm,
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
  inputError: {
    borderColor: COLORS.error,
    backgroundColor: "#FFF7F7",
  },
  errorText: {
    fontSize: 11,
    color: COLORS.error,
    fontFamily: FONTS.montserrat,
    marginTop: -2,
    marginBottom: 2,
  },
  inputMultiline: {
    minHeight: 88,
    paddingTop: Platform.OS === "ios" ? 12 : 10,
  },
  typeRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  actionsRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
});
