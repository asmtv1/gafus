import { useState, useEffect } from "react";
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
import { TexturedSafeAreaView as SafeAreaView } from "@/shared/components";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { BORDER_RADIUS, COLORS, FONTS, SPACING } from "@/shared/config";
import { validatePetForm, type PetFormErrors } from "@/features/pets";
import { Button, MascotSpinner } from "@/shared/components/ui";
import { parsePetKind, petsApi, type CreatePetData, type PetKind } from "@/shared/lib/api";
import { formatIsoBirthDateToDdMmYyyy } from "@/shared/lib/utils/birthDateInput";
import { hapticFeedback } from "@/shared/lib/utils/haptics";

const LOG_PREFIX = "[EditPetScreen]";

const PET_TYPES = [
  { value: "DOG" as const, label: "Собака", icon: "dog" as const },
  { value: "CAT" as const, label: "Кошка", icon: "cat" as const },
];

/**
 * Редактировать питомца — тот же визуальный паттерн, что «Напоминания» / «О себе»
 */
export default function EditPetScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const rawId = useLocalSearchParams<{ id: string | string[] }>().id;
  const petId = typeof rawId === "string" ? rawId : (rawId?.[0] ?? "");
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

  const { data: petData, isLoading: isLoadingPet } = useQuery({
    queryKey: ["pet", petId],
    queryFn: async () => {
      const response = await petsApi.getById(petId);
      if (!response.success || !response.data) {
        throw new Error(response.error ?? "Питомец не найден");
      }
      return response.data;
    },
    enabled: !!petId,
  });

  useEffect(() => {
    if (!petData || petData.id !== petId) return;
    setName(petData.name || "");
    setType(parsePetKind(petData.type));
    setBreed(petData.breed || "");
    setBirthDate(formatIsoBirthDateToDdMmYyyy(petData.birthDate ?? ""));
    setHeightCm(petData.heightCm != null ? String(petData.heightCm) : "");
    setWeightKg(petData.weightKg != null ? String(petData.weightKg) : "");
    setNeckGirthCm(petData.neckGirthCm != null ? String(petData.neckGirthCm) : "");
    setMuzzleGirthCm(petData.muzzleGirthCm != null ? String(petData.muzzleGirthCm) : "");
    setBellyGirthCm(petData.bellyGirthCm != null ? String(petData.bellyGirthCm) : "");
    setNotes(petData.notes || "");
    setErrors({});
  }, [petData, petId]);

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreatePetData> }) => {
      const res = await petsApi.update(id, data);
      if (!res.success) throw new Error(res.error ?? "Не удалось обновить питомца");
      return res;
    },
    onSuccess: (data) => {
      if (__DEV__) {
        console.log(`${LOG_PREFIX} Питомец успешно обновлен`, {
          petId,
          petName: data.data?.name,
          petType: data.data?.type,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["pets"] });
      queryClient.invalidateQueries({ queryKey: ["pet"] });
      void hapticFeedback.success();
      router.back();
    },
    onError: (error) => {
      if (__DEV__) {
        console.error(`${LOG_PREFIX} Ошибка при обновлении питомца`, {
          error: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        });
      }
      Alert.alert("Ошибка", error instanceof Error ? error.message : "Не удалось обновить питомца");
    },
  });

  const handleBack = () => {
    void hapticFeedback.light();
    router.back();
  };

  const handleSave = () => {
    if (!petId) {
      Alert.alert("Ошибка", "ID питомца не указан");
      return;
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
      setErrors(validation.errors);
      return;
    }

    setErrors({});
    const petPayload: Partial<CreatePetData> = {
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

    updateMutation.mutate({ id: petId, data: petPayload });
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <Pressable style={styles.backRow} onPress={handleBack} hitSlop={12}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={COLORS.primary} />
          <Text style={styles.backText}>Назад</Text>
        </Pressable>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          {isLoadingPet ? (
            <View style={styles.centerBlock}>
              <MascotSpinner size="large" style={{ marginBottom: SPACING.sm }} />
              <Text style={styles.mutedText}>Загрузка…</Text>
            </View>
          ) : !petData ? (
            <ScrollView contentContainerStyle={styles.scrollContent}>
              <View style={styles.formCard}>
                <Text style={styles.screenTitle}>Редактировать питомца</Text>
                <Text style={styles.errorInline}>Питомец не найден</Text>
                <Button label="Назад" variant="outline" onPress={handleBack} />
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
                      icon={t.icon}
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
                  placeholder="Необязательно"
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
                    disabled={updateMutation.isPending}
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
  centerBlock: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.lg,
  },
  mutedText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
  },
  scrollContent: {
    padding: SPACING.md,
    paddingTop: 0,
    paddingBottom: SPACING.xl,
  },
  formCard: {
    backgroundColor: "#F5F0E8",
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
