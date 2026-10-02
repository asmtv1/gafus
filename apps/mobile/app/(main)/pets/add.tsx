import { useState } from "react";
import { Image } from "expo-image";
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
} from "react-native";
import { Text } from "react-native-paper";
import { Stack, useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { COLORS, FONTS, SPACING } from "@/shared/config";
import { PageHeader, TexturedSafeAreaView } from "@/shared/components";
import { Button } from "@/shared/components/ui";
import { useMobileOnboardingTourStore } from "@/features/onboarding-tour";
import { validatePetForm, type PetFormErrors } from "@/features/pets";
import { petsApi, type CreatePetData, type PetKind } from "@/shared/lib/api";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { trackEvent } from "@/shared/lib/analytics";

const LOG_PREFIX = "[AddPetScreen]";

const PET_TYPES = [
  { value: "DOG" as const, label: "Собака", image: require("../../../assets/images/pet-type-dog.webp") },
  { value: "CAT" as const, label: "Кошка", image: require("../../../assets/images/pet-type-cat.webp") },
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

  const createMutation = useMutation({
    mutationFn: petsApi.create,
    onSuccess: (data) => {
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
    onError: (error) => {
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
    void hapticFeedback.light();
    router.back();
  };

  const handleSave = () => {
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

    createMutation.mutate(petData);
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
        <Pressable style={styles.backRow} onPress={handleBack} hitSlop={12}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={COLORS.primary} />
          <Text style={styles.backText}>Назад</Text>
        </Pressable>

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

              <View style={[styles.actionsRow, isTourRequiredPetCreation && styles.actionsRowTour]}>
                <Button
                  label={isTourRequiredPetCreation ? "Назад" : "Отмена"}
                  variant="secondary"
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
                  onPress={handleBack}
                  disabled={createMutation.isPending}
                />
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
                  onPress={handleSave}
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
