import { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { Text, Surface, IconButton } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, Input } from "@/shared/components/ui";
import { parsePetKind, petsApi, type CreatePetData, type PetKind } from "@/shared/lib/api";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { COLORS, SPACING } from "@/constants";

const LOG_PREFIX = "[EditPetScreen]";

const PET_TYPES = [
  { value: "DOG", label: "Собака", icon: "dog" },
  { value: "CAT", label: "Кошка", icon: "cat" },
] as const satisfies ReadonlyArray<{ value: PetKind; label: string; icon: string }>;

/**
 * Экран редактирования питомца
 */
export default function EditPetScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const rawId = useLocalSearchParams<{ id: string | string[] }>().id;
  const petId = typeof rawId === "string" ? rawId : rawId?.[0] ?? "";
  const [name, setName] = useState("");
  const [type, setType] = useState<PetKind>("DOG");
  const [breed, setBreed] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [notes, setNotes] = useState("");

  // Загрузка питомца по id (тот же источник, что и GET /pets/:id на API)
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

  // Заполнение формы при загрузке питомца (проверка id — от залипания кэша при смене маршрута)
  useEffect(() => {
    if (!petData || petData.id !== petId) return;
    setName(petData.name || "");
    setType(parsePetKind(petData.type));
    setBreed(petData.breed || "");
    setBirthDate(
      petData.birthDate ? new Date(petData.birthDate).toISOString().split("T")[0] : "",
    );
    setHeightCm(petData.heightCm != null ? String(petData.heightCm) : "");
    setWeightKg(petData.weightKg != null ? String(petData.weightKg) : "");
    setNotes(petData.notes || "");
  }, [petData, petId]);

  // Обновление питомца
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
      hapticFeedback.success();
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

  const handleSave = () => {
    if (!petId) {
      Alert.alert("Ошибка", "ID питомца не указан");
      return;
    }

    if (__DEV__) {
      console.log(`${LOG_PREFIX} Начало сохранения питомца`, {
        petId,
        name,
        type,
        breed,
        birthDate,
      });
    }

    // Валидация обязательных полей
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

    if (!birthDate.trim()) {
      if (__DEV__) {
        console.warn(`${LOG_PREFIX} Валидация не пройдена: дата рождения пустая`);
      }
      Alert.alert("Ошибка", "Дата рождения обязательна");
      return;
    }

    // Валидация даты
    const date = new Date(birthDate);
    if (isNaN(date.getTime())) {
      if (__DEV__) {
        console.warn(`${LOG_PREFIX} Валидация не пройдена: неверный формат даты`, { birthDate });
      }
      Alert.alert("Ошибка", "Неверный формат даты");
      return;
    }

    if (date > new Date()) {
      if (__DEV__) {
        console.warn(`${LOG_PREFIX} Валидация не пройдена: дата в будущем`, { birthDate });
      }
      Alert.alert("Ошибка", "Дата не может быть в будущем");
      return;
    }

    // Валидация числовых полей
    const height = heightCm.trim() ? parseFloat(heightCm) : undefined;
    const weight = weightKg.trim() ? parseFloat(weightKg) : undefined;

    if (height !== undefined && (isNaN(height) || height < 1 || height > 200)) {
      if (__DEV__) {
        console.warn(`${LOG_PREFIX} Валидация не пройдена: неверный рост`, { height, heightCm });
      }
      Alert.alert("Ошибка", "Рост должен быть от 1 до 200 см");
      return;
    }

    if (weight !== undefined && (isNaN(weight) || weight < 0.1 || weight > 200)) {
      if (__DEV__) {
        console.warn(`${LOG_PREFIX} Валидация не пройдена: неверный вес`, { weight, weightKg });
      }
      Alert.alert("Ошибка", "Вес должен быть от 0.1 до 200 кг");
      return;
    }

    const petData: Partial<CreatePetData> = {
      name: name.trim(),
      type,
      breed: breed.trim(),
      birthDate: birthDate.trim(),
      heightCm: height,
      weightKg: weight,
      notes: notes.trim() || undefined,
    };

    if (__DEV__) {
      console.log(`${LOG_PREFIX} Валидация пройдена, отправка данных на сервер`, {
        petId,
        petData: { ...petData, notes: petData.notes ? "[заметки есть]" : undefined },
      });
    }

    updateMutation.mutate({ id: petId, data: petData });
  };

  if (isLoadingPet) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: "Редактировать питомца" }} />
        <SafeAreaView style={styles.container} edges={["bottom"]}>
          <View style={styles.loadingContainer}>
            <Text>Загрузка...</Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  if (!petData) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: "Редактировать питомца" }} />
        <SafeAreaView style={styles.container} edges={["bottom"]}>
          <View style={styles.loadingContainer}>
            <Text>Питомец не найден</Text>
            <Button label="Назад" variant="outline" onPress={() => router.back()} />
          </View>
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Редактировать питомца" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Основная информация */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Основная информация</Text>

              <Input
                label="Имя питомца *"
                value={name}
                onChangeText={setName}
                placeholder="Введите имя питомца"
              />

              <Text style={styles.fieldLabel}>
                Тип <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.typeSelector}>
                {PET_TYPES.map((t) => (
                  <Surface
                    key={t.value}
                    style={[styles.typeOption, type === t.value && styles.typeOptionSelected]}
                    elevation={type === t.value ? 2 : 0}
                  >
                    <IconButton
                      icon={t.icon}
                      size={24}
                      iconColor={type === t.value ? COLORS.primary : COLORS.textSecondary}
                      onPress={() => setType(t.value)}
                    />
                    <Text style={[styles.typeLabel, type === t.value && styles.typeLabelSelected]}>
                      {t.label}
                    </Text>
                  </Surface>
                ))}
              </View>

              <Input
                label="Порода *"
                value={breed}
                onChangeText={setBreed}
                placeholder="Введите породу"
              />

              <Input
                label="Дата рождения *"
                value={birthDate}
                onChangeText={setBirthDate}
                placeholder="YYYY-MM-DD"
                keyboardType="default"
              />
            </View>

            {/* Физические характеристики */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Физические характеристики</Text>

              <Input
                label="Рост (см)"
                value={heightCm}
                onChangeText={setHeightCm}
                placeholder="Введите рост"
                keyboardType="numeric"
              />

              <Input
                label="Вес (кг)"
                value={weightKg}
                onChangeText={setWeightKg}
                placeholder="Введите вес"
                keyboardType="numeric"
              />
            </View>

            {/* Дополнительная информация */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Дополнительная информация</Text>

              <Input
                label="Заметки"
                value={notes}
                onChangeText={setNotes}
                placeholder="Дополнительная информация о питомце"
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.actions}>
              <Button
                label="Отмена"
                variant="outline"
                onPress={() => router.back()}
                style={styles.actionButton}
              />
              <Button
                label="Сохранить"
                variant="primary"
                onPress={handleSave}
                loading={updateMutation.isPending}
                disabled={
                  !name.trim() || !breed.trim() || !birthDate.trim() || updateMutation.isPending
                }
                style={styles.actionButton}
              />
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
  scrollContent: {
    padding: SPACING.lg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.xl,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  fieldLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
    marginTop: SPACING.sm,
  },
  required: {
    color: COLORS.error,
    fontWeight: "bold",
  },
  typeSelector: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  typeOption: {
    flex: 1,
    alignItems: "center",
    padding: SPACING.sm,
    borderRadius: 12,
    backgroundColor: COLORS.background,
  },
  typeOptionSelected: {
    backgroundColor: COLORS.primary + "15",
  },
  typeLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  typeLabelSelected: {
    color: COLORS.primary,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  actionButton: {
    flex: 1,
  },
});
