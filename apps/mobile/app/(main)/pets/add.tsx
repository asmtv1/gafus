import { useState } from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { BORDER_RADIUS, COLORS, FONTS, SPACING } from "@/constants";
import { petsApi, type CreatePetData, type PetKind } from "@/shared/lib/api";
import { validatePetBirthDateInput } from "@/shared/lib/utils/birthDateInput";
import { hapticFeedback } from "@/shared/lib/utils/haptics";

const LOG_PREFIX = "[AddPetScreen]";

const PET_TYPES = [
  { value: "DOG" as const, label: "Собака", icon: "dog" as const },
  { value: "CAT" as const, label: "Кошка", icon: "cat" as const },
];

/**
 * Добавить питомца — тот же визуальный паттерн, что «Напоминания» / «О себе»
 */
export default function AddPetScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<PetKind>("DOG");
  const [breed, setBreed] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [notes, setNotes] = useState("");

  const createMutation = useMutation({
    mutationFn: petsApi.create,
    onSuccess: (data) => {
      if (__DEV__) {
        console.log(`${LOG_PREFIX} Питомец успешно создан`, {
          petId: data.data?.id,
          petName: data.data?.name,
          petType: data.data?.type,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["pets"] });
      void hapticFeedback.success();
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
      Alert.alert(
        "Ошибка",
        error instanceof Error ? error.message : "Не удалось добавить питомца",
      );
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
        hasWeight: !!weightKg,
        hasNotes: !!notes,
      });
    }

    if (!name.trim()) {
      if (__DEV__) {
        console.warn(`${LOG_PREFIX} Валидация не пройдена: имя питомца пустое`);
      }
      Alert.alert("Ошибка", "Имя питомца обязательно");
      return;
    }

    if (!breed.trim()) {
      if (__DEV__) {
        console.warn(`${LOG_PREFIX} Валидация не пройдена: порода пустая`);
      }
      Alert.alert("Ошибка", "Порода обязательна");
      return;
    }

    const birthCheck = validatePetBirthDateInput(birthDate);
    if (!birthCheck.ok) {
      if (__DEV__) {
        console.warn(`${LOG_PREFIX} Валидация даты не пройдена`, {
          birthDate,
          message: birthCheck.message,
        });
      }
      Alert.alert("Ошибка", birthCheck.message);
      return;
    }

    const height = heightCm.trim() ? parseFloat(heightCm) : undefined;
    const weight = weightKg.trim() ? parseFloat(weightKg) : undefined;

    if (height !== undefined && (isNaN(height) || height < 1 || height > 200)) {
      if (__DEV__) {
        console.warn(`${LOG_PREFIX} Валидация не пройдена: неверный рост`, {
          height,
          heightCm,
        });
      }
      Alert.alert("Ошибка", "Рост должен быть от 1 до 200 см");
      return;
    }

    if (weight !== undefined && (isNaN(weight) || weight < 0.1 || weight > 200)) {
      if (__DEV__) {
        console.warn(`${LOG_PREFIX} Валидация не пройдена: неверный вес`, {
          weight,
          weightKg,
        });
      }
      Alert.alert("Ошибка", "Вес должен быть от 0.1 до 200 кг");
      return;
    }

    const petData: CreatePetData = {
      name: name.trim(),
      type,
      breed: breed.trim(),
      birthDate: birthCheck.apiValue,
      heightCm: height,
      weightKg: weight,
      notes: notes.trim() || undefined,
    };

    if (__DEV__) {
      console.log(`${LOG_PREFIX} Валидация пройдена, отправка данных на сервер`, {
        petData: { ...petData, notes: petData.notes ? "[заметки есть]" : undefined },
      });
    }

    createMutation.mutate(petData);
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
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.formCard}>
              <Text style={styles.screenTitle}>Добавить питомца</Text>

              <Text style={styles.sectionHeading}>Основная информация</Text>

              <Text style={styles.fieldLabel}>Имя питомца *</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                style={styles.input}
                placeholder="Кличка"
                placeholderTextColor={COLORS.disabled}
              />

              <Text style={styles.fieldLabel}>Тип *</Text>
              <View style={styles.typeRow}>
                {PET_TYPES.map((t) => (
                  <Pressable
                    key={t.value}
                    style={[styles.typeChip, type === t.value && styles.typeChipSelected]}
                    onPress={() => {
                      void hapticFeedback.selection();
                      setType(t.value);
                    }}
                  >
                    <MaterialCommunityIcons
                      name={t.icon}
                      size={20}
                      color={type === t.value ? COLORS.onPrimary : COLORS.textSecondary}
                    />
                    <Text
                      style={[
                        styles.typeChipText,
                        type === t.value && styles.typeChipTextSelected,
                      ]}
                    >
                      {t.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Порода *</Text>
              <TextInput
                value={breed}
                onChangeText={setBreed}
                style={styles.input}
                placeholder="Порода"
                placeholderTextColor={COLORS.disabled}
              />

              <Text style={styles.fieldLabel}>Дата рождения *</Text>
              <TextInput
                value={birthDate}
                onChangeText={setBirthDate}
                style={styles.input}
                placeholder="ДД.ММ.ГГГГ"
                placeholderTextColor={COLORS.disabled}
                keyboardType="numbers-and-punctuation"
              />
              <Text style={styles.hintText}>Формат: ДД.ММ.ГГГГ</Text>

              <Text style={[styles.sectionHeading, styles.sectionHeadingSpaced]}>
                Физические характеристики
              </Text>

              <Text style={styles.fieldLabel}>Рост (см)</Text>
              <TextInput
                value={heightCm}
                onChangeText={setHeightCm}
                style={styles.input}
                placeholder="Необязательно"
                placeholderTextColor={COLORS.disabled}
                keyboardType="decimal-pad"
              />

              <Text style={styles.fieldLabel}>Вес (кг)</Text>
              <TextInput
                value={weightKg}
                onChangeText={setWeightKg}
                style={styles.input}
                placeholder="Необязательно"
                placeholderTextColor={COLORS.disabled}
                keyboardType="decimal-pad"
              />

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
                <Pressable
                  style={styles.secondaryButton}
                  onPress={handleBack}
                  disabled={createMutation.isPending}
                >
                  <Text style={styles.secondaryButtonText}>Отмена</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.primaryButton,
                    createMutation.isPending && styles.primaryButtonDisabled,
                  ]}
                  onPress={handleSave}
                  disabled={
                    !name.trim() ||
                    !breed.trim() ||
                    !birthDate.trim() ||
                    createMutation.isPending
                  }
                >
                  <Text style={styles.primaryButtonText}>
                    {createMutation.isPending ? "Добавление…" : "Добавить"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
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
    minHeight: 88,
    paddingTop: Platform.OS === "ios" ? 12 : 10,
  },
  typeRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  typeChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    backgroundColor: "#FFF",
  },
  typeChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  typeChipText: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: FONTS.montserrat,
    color: COLORS.textSecondary,
  },
  typeChipTextSelected: {
    color: COLORS.onPrimary,
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
  primaryButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primary,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: COLORS.onPrimary,
    fontWeight: "600",
    fontFamily: FONTS.montserrat,
    fontSize: 14,
  },
});
