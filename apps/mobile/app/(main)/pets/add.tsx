import { useEffect, useRef, useState } from "react";
import { usePetCreateMockIntent } from "@/features/pets/usePetCreateMockIntent";
import { usePetCreateOnlineIntent } from "@/features/pets/usePetCreateOnlineIntent";
import { useAuthStore } from "@/shared/stores/authStore";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { Image } from "expo-image";
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from "react-native";
import { Text } from "react-native-paper";
import { Stack, useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { COLORS, FONTS, SPACING } from "@/shared/config";
import { AppBackButton, PageHeader, TexturedSafeAreaView } from "@/shared/components";
import { Button } from "@/shared/components/ui";
import { useMobileOnboardingTourStore } from "@/features/onboarding-tour";
import { validatePetForm, type PetFormErrors } from "@/features/pets";
import { petsApi, type CreatePetData, type PetKind } from "@/shared/lib/api";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { trackEvent } from "@/shared/lib/analytics";

type AddPetCreateVariables =
  | {
      kind: "create";
      data: CreatePetData;
      fresh: boolean;
      actor: { ownerId: string; authEpoch: string } | null;
    }
  | { kind: "retry"; actor: { ownerId: string; authEpoch: string } | null };

const LOG_PREFIX = "[AddPetScreen]";

const PET_TYPES = [
  {
    value: "DOG" as const,
    label: "Собака",
    image: require("../../../assets/images/pet-type-dog.webp"),
  },
  {
    value: "CAT" as const,
    label: "Кошка",
    image: require("../../../assets/images/pet-type-cat.webp"),
  },
];

/**
 * Добавить питомца — тот же визуальный паттерн, что «Напоминания» / «О себе»
 */
export default function AddPetScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const tourIsActive = useMobileOnboardingTourStore((s) => s.isActive);
  const tourStepId = useMobileOnboardingTourStore((s) => s.currentStepId);
  const tourIsAwaitingRequiredPetCreation = useMobileOnboardingTourStore(
    (s) => s.isAwaitingRequiredPetCreation,
  );
  const completeRequiredPetCreation = useMobileOnboardingTourStore(
    (s) => s.completeRequiredPetCreation,
  );
  const isTourRequiredPetCreation =
    tourIsActive && tourStepId === "add-pet" && tourIsAwaitingRequiredPetCreation;
  const [name, setName] = useState("");
  const [type, setType] = useState<PetKind>("DOG");
  const [breed, setBreed] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [neckGirthCm, setNeckGirthCm] = useState("");
  const [muzzleGirthCm, setMuzzleGirthCm] = useState("");
  const [bellyGirthCm, setBellyGirthCm] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<PetFormErrors>({});
  const mockIntent = usePetCreateMockIntent();
  const onlineIntent = usePetCreateOnlineIntent();
  const screenMounted = useRef(true);
  useEffect(() => {
    screenMounted.current = true;
    return () => {
      screenMounted.current = false;
      onlineIntent.cancel();
    };
    // Only the component lifetime matters: onlineIntent returns a hook facade every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const canApplyMutation = (actor: { ownerId: string; authEpoch: string } | null) => {
    const binding = newOnlyV2NativeQueues.getVerifiedBinding();
    return Boolean(
      screenMounted.current &&
        actor &&
        binding?.principalId === actor.ownerId &&
        binding.authEpoch === actor.authEpoch &&
        useAuthStore.getState().user?.id === actor.ownerId,
    );
  };
  const [mockOptIn, setMockOptIn] = useState(false);

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

  const createMutation = useMutation({
    mutationFn: (variables: AddPetCreateVariables) =>
      variables.kind === "retry"
        ? onlineIntent.retry()
        : onlineIntent.submit(variables.data, variables.fresh),
    onSuccess: (data, variables) => {
      if (!canApplyMutation(variables.actor)) return;
      trackEvent({
        eventName: "button_click",
        platform: "mobile",
        pathOrScreen: "/pets/add",
        elementId: "pet-add-success",
      });
      if (__DEV__) {
        console.log(`${LOG_PREFIX} Питомец успешно создан`, {
          petId: data.data?.id,
          petName: data.data?.name,
          petType: data.data?.type,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["pets"] });
      void hapticFeedback.success();
      if (tourIsActive && tourStepId === "add-pet" && tourIsAwaitingRequiredPetCreation) {
        completeRequiredPetCreation();
      }
      router.back();
    },
    onError: (error, variables) => {
      if (!canApplyMutation(variables.actor)) return;
      if (__DEV__) {
        console.error(`${LOG_PREFIX} Ошибка при создании питомца`, {
          error: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          petData: { name, type, breed, birthDate },
        });
      }
      Alert.alert("Ошибка", error instanceof Error ? error.message : "Не удалось добавить питомца");
    },
  });

  const handleBack = () => {
    // Router transitions are asynchronous: fence callbacks at the moment of leaving.
    screenMounted.current = false;
    mockIntent.cancel();
    onlineIntent.cancel();
    void hapticFeedback.light();
    router.back();
  };

  const handleRetry = () => {
    if (createMutation.isPending) return;
    const binding = newOnlyV2NativeQueues.getVerifiedBinding();
    const userId = useAuthStore.getState().user?.id;
    const actor =
      binding && binding.principalId === userId
        ? { ownerId: userId, authEpoch: binding.authEpoch }
        : null;
    createMutation.mutate({ kind: "retry", actor });
  };

  const handleSave = (newIntent = false) => {
    if (__DEV__) {
      console.log(`${LOG_PREFIX} Начало сохранения питомца`, {
        name,
        type,
        breed,
        birthDate,
        hasHeight: !!heightCm,
        hasNeckGirth: !!neckGirthCm,
        hasMuzzleGirth: !!muzzleGirthCm,
        hasBellyGirth: !!bellyGirthCm,
        hasNotes: !!notes,
      });
    }

    const validation = validatePetForm({
      name,
      breed,
      birthDate,
      heightCm,
      weightKg,
      neckGirthCm,
      muzzleGirthCm,
      bellyGirthCm,
    });
    if (!validation.ok) {
      if (__DEV__) {
        console.warn(`${LOG_PREFIX} Валидация не пройдена`, validation.errors);
      }
      setErrors(validation.errors);
      return;
    }

    setErrors({});
    const petData: CreatePetData = {
      name: validation.values.name,
      type,
      breed: validation.values.breed,
      birthDate: validation.values.birthDate,
      heightCm: validation.values.heightCm,
      weightKg: validation.values.weightKg,
      neckGirthCm: validation.values.neckGirthCm,
      muzzleGirthCm: validation.values.muzzleGirthCm,
      bellyGirthCm: validation.values.bellyGirthCm,
      notes: notes.trim() || undefined,
    };

    if (__DEV__) {
      console.log(`${LOG_PREFIX} Валидация пройдена, отправка данных на сервер`, {
        petData: { ...petData, notes: petData.notes ? "[заметки есть]" : undefined },
      });
    }

    if (__DEV__ && mockOptIn) {
      void mockIntent.submit(petData, newIntent);
      return;
    }
    if (createMutation.isPending) return;
    const actorBinding = newOnlyV2NativeQueues.getVerifiedBinding();
    const userId = useAuthStore.getState().user?.id;
    const actor =
      actorBinding && actorBinding.principalId === userId
        ? { ownerId: userId, authEpoch: actorBinding.authEpoch }
        : null;
    createMutation.mutate({ kind: "create", data: petData, fresh: newIntent, actor });
    trackEvent({
      eventName: "button_click",
      platform: "mobile",
      pathOrScreen: "/pets/add",
      elementId: "pet-add-submit",
    });
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <TexturedSafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <AppBackButton style={styles.backRow} onPress={handleBack} />

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <PageHeader
              title="Добавить питомца"
              description="Заполните основные данные — остальное можно добавить позже"
            />
            <View style={styles.formCard}>
              {isTourRequiredPetCreation ? (
                <Text style={styles.hintText}>
                  Для продолжения экскурсии заполните только обязательные поля.
                </Text>
              ) : null}

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

              {!isTourRequiredPetCreation ? (
                <>
                  <Text style={[styles.sectionHeading, styles.sectionHeadingSpaced]}>
                    Физические характеристики
                  </Text>

                  <Text style={styles.fieldLabel}>Рост (см)</Text>
                  <TextInput
                    value={heightCm}
                    onChangeText={(value) => updateField("heightCm", value, setHeightCm)}
                    style={[styles.input, errors.heightCm && styles.inputError]}
                    placeholder="Необязательно"
                    placeholderTextColor={COLORS.disabled}
                    keyboardType="decimal-pad"
                  />
                  {errors.heightCm ? <Text style={styles.errorText}>{errors.heightCm}</Text> : null}

                  <Text style={styles.fieldLabel}>Вес (кг)</Text>
                  <TextInput
                    value={weightKg}
                    onChangeText={(value) => updateField("weightKg", value, setWeightKg)}
                    style={[styles.input, errors.weightKg && styles.inputError]}
                    placeholder="Необязательно, 0.1–200 кг"
                    placeholderTextColor={COLORS.disabled}
                    keyboardType="decimal-pad"
                  />
                  {errors.weightKg ? <Text style={styles.errorText}>{errors.weightKg}</Text> : null}
                  <Text style={styles.fieldLabel}>Обхват шеи (см)</Text>
                  <TextInput
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
                </>
              ) : null}

              {!mockOptIn && onlineIntent.uncertain ? (
                <View>
                  <Text>
                    Результат создания не подтверждён. Повтор использует прежний ключ операции.
                  </Text>
                  <Button label="Повторить создание" onPress={handleRetry} />
                  <Button label="Начать новое создание" onPress={() => handleSave(true)} />
                </View>
              ) : null}
              {__DEV__ && !mockOptIn ? (
                <Button
                  label="Включить тестовый режим (без отправки)"
                  onPress={() => setMockOptIn(true)}
                />
              ) : null}
              {__DEV__ && mockOptIn ? (
                <Button
                  label="Выключить тестовый режим"
                  onPress={() => {
                    mockIntent.cancel();
                    setMockOptIn(false);
                  }}
                />
              ) : null}
              {__DEV__ && mockOptIn && mockIntent.status !== "IDLE" ? (
                <View>
                  <Text>
                    {mockIntent.status === "UNCERTAIN"
                      ? "Тест: результат не подтверждён (реальный запрос не выполнялся)"
                      : "Тест: ошибка подготовки, питомец не отправлен"}
                  </Text>
                  <Button label="Повторить тестовую операцию" onPress={() => handleSave(false)} />
                  <Button
                    label="Создать новую тестовую операцию"
                    onPress={() => handleSave(true)}
                  />
                  <Button label="Отменить тестовую операцию" onPress={mockIntent.cancel} />
                </View>
              ) : null}
              <View style={[styles.actionsRow, isTourRequiredPetCreation && styles.actionsRowTour]}>
                {isTourRequiredPetCreation ? (
                  <AppBackButton onPress={handleBack} disabled={createMutation.isPending} />
                ) : (
                  <Button
                    label="Отмена"
                    variant="secondary"
                    flex={1}
                    height={48}
                    fontFamily={FONTS.montserrat}
                    fontWeight="600"
                    fontSize={15}
                    lineHeight={20}
                    horizontalPadding={0}
                    verticalPadding={14}
                    borderRadius={10}
                    onPress={handleBack}
                    disabled={createMutation.isPending}
                  />
                )}
                <Button
                  label={
                    createMutation.isPending
                      ? "Добавление…"
                      : isTourRequiredPetCreation
                        ? "Создать питомца"
                        : "Добавить"
                  }
                  flex={isTourRequiredPetCreation ? undefined : 1}
                  fullWidth={isTourRequiredPetCreation}
                  height={48}
                  fontFamily={FONTS.montserrat}
                  fontWeight="600"
                  fontSize={15}
                  lineHeight={20}
                  horizontalPadding={0}
                  verticalPadding={14}
                  borderRadius={10}
                  onPress={() => handleSave(false)}
                  disabled={createMutation.isPending}
                />
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </TexturedSafeAreaView>
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
    fontFamily: FONTS.montserratMedium,
  },
  scrollContent: {
    padding: SPACING.md,
    paddingTop: 0,
    paddingBottom: SPACING.xxl,
  },
  formCard: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 16,
    padding: SPACING.md,
    gap: SPACING.sm,
    shadowColor: "#4A4A1E",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.13,
    shadowRadius: 12,
    elevation: 4,
  },
  sectionHeading: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: FONTS.impact,
    color: COLORS.text,
    marginTop: SPACING.sm,
  },
  sectionHeadingSpaced: {
    marginTop: SPACING.md,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: FONTS.montserratMedium,
    color: COLORS.textSecondary,
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
    borderRadius: 14,
    minHeight: 52,
    backgroundColor: "#FFFCF4",
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
  actionsRowTour: {
    flexDirection: "column-reverse",
  },
});
