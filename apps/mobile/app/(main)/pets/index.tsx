import { useState, useEffect } from "react";
import { View, StyleSheet, FlatList, RefreshControl, Alert, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { Text, FAB, Portal, Modal, Surface, IconButton } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Card, Loading, Button, Input } from "@/shared/components/ui";
import { petsApi, type Pet, type CreatePetData } from "@/shared/lib/api";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { COLORS, SPACING } from "@/constants";

const LOG_PREFIX = "[PetsScreen]";

const PET_TYPES = [
  { value: "DOG", label: "Собака", icon: "dog" },
  { value: "CAT", label: "Кошка", icon: "cat" },
  { value: "OTHER", label: "Другое", icon: "paw" },
] as const;

/**
 * Экран списка питомцев
 */
export default function PetsScreen() {
  const queryClient = useQueryClient();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPet, setEditingPet] = useState<Pet | null>(null);

  // Загрузка питомцев
  const { data, isLoading, refetch, isRefetching, error } = useQuery({
    queryKey: ["pets"],
    queryFn: petsApi.getAll,
    onSuccess: (response) => {
      if (__DEV__) {
        console.log(`${LOG_PREFIX} Список питомцев загружен`, {
          count: response.data?.length || 0,
          success: response.success,
        });
      }
    },
    onError: (err) => {
      if (__DEV__) {
        console.error(`${LOG_PREFIX} Ошибка при загрузке списка питомцев`, {
          error: err instanceof Error ? err.message : String(err),
          errorStack: err instanceof Error ? err.stack : undefined,
        });
      }
    },
  });

  // Создание питомца
  const createMutation = useMutation({
    mutationFn: petsApi.create,
    onSuccess: (data) => {
      if (__DEV__) {
        console.log(`${LOG_PREFIX} Питомец успешно создан через модальное окно`, {
          petId: data.data?.id,
          petName: data.data?.name,
          petType: data.data?.type,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["pets"] });
      setModalVisible(false);
      hapticFeedback.success();
    },
    onError: (error) => {
      if (__DEV__) {
        console.error(`${LOG_PREFIX} Ошибка при создании питомца через модальное окно`, {
          error: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        });
      }
    },
  });

  // Обновление питомца
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreatePetData> }) => {
      if (__DEV__) {
        console.log(`${LOG_PREFIX} Начало обновления питомца`, {
          petId: id,
          updatedFields: Object.keys(data),
        });
      }
      return petsApi.update(id, data);
    },
    onSuccess: (data, variables) => {
      if (__DEV__) {
        console.log(`${LOG_PREFIX} Питомец успешно обновлен`, {
          petId: variables.id,
          petName: data.data?.name,
          petType: data.data?.type,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["pets"] });
      setModalVisible(false);
      setEditingPet(null);
      hapticFeedback.success();
    },
    onError: (error, variables) => {
      if (__DEV__) {
        console.error(`${LOG_PREFIX} Ошибка при обновлении питомца`, {
          petId: variables.id,
          error: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        });
      }
    },
  });

  // Удаление питомца
  const deleteMutation = useMutation({
    mutationFn: petsApi.delete,
    onSuccess: (data, petId) => {
      if (__DEV__) {
        console.log(`${LOG_PREFIX} Питомец успешно удален`, {
          petId,
          success: data.success,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["pets"] });
      hapticFeedback.success();
    },
    onError: (error, petId) => {
      if (__DEV__) {
        console.error(`${LOG_PREFIX} Ошибка при удалении питомца`, {
          petId,
          error: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        });
      }
    },
  });

  const handleDelete = (pet: Pet) => {
    if (__DEV__) {
      console.log(`${LOG_PREFIX} Показ диалога удаления питомца`, {
        petId: pet.id,
        petName: pet.name,
      });
    }
    Alert.alert(
      "Удалить питомца",
      `Вы уверены, что хотите удалить ${pet.name}?`,
      [
        {
          text: "Отмена",
          style: "cancel",
          onPress: () => {
            if (__DEV__) {
              console.log(`${LOG_PREFIX} Удаление отменено пользователем`, { petId: pet.id });
            }
          },
        },
        {
          text: "Удалить",
          style: "destructive",
          onPress: () => {
            if (__DEV__) {
              console.log(`${LOG_PREFIX} Пользователь подтвердил удаление`, { petId: pet.id });
            }
            deleteMutation.mutate(pet.id);
          },
        },
      ]
    );
  };

  const handleEdit = (pet: Pet) => {
    if (__DEV__) {
      console.log(`${LOG_PREFIX} Открытие модального окна для редактирования питомца`, {
        petId: pet.id,
        petName: pet.name,
      });
    }
    setEditingPet(pet);
    setModalVisible(true);
  };

  const handleAdd = () => {
    if (__DEV__) {
      console.log(`${LOG_PREFIX} Открытие модального окна для добавления питомца`);
    }
    setEditingPet(null);
    setModalVisible(true);
  };

  const pets = data?.data || [];

  const renderPetCard = ({ item }: { item: Pet }) => {
    const typeInfo = PET_TYPES.find((t) => t.value === item.type) || PET_TYPES[2];

    return (
      <Card style={styles.petCard}>
        <Card.Content style={styles.petContent}>
          <View style={styles.petIcon}>
            <MaterialCommunityIcons
              name={typeInfo.icon as keyof typeof MaterialCommunityIcons.glyphMap}
              size={40}
              color={COLORS.primary}
            />
          </View>
          <View style={styles.petInfo}>
            <Text variant="titleMedium" style={styles.petName}>
              {item.name}
            </Text>
            <Text style={styles.petType}>{typeInfo.label}</Text>
            {item.breed && <Text style={styles.petBreed}>{item.breed}</Text>}
          </View>
          <View style={styles.petActions}>
            <IconButton
              icon="pencil"
              size={28}
              iconColor="#ECE5D2"
              onPress={() => handleEdit(item)}
              style={styles.editButton}
            />
            <IconButton
              icon="delete"
              size={28}
              iconColor="#ECE5D2"
              onPress={() => handleDelete(item)}
              style={styles.deleteButton}
            />
          </View>
        </Card.Content>
      </Card>
    );
  };

  if (isLoading) {
    return <Loading fullScreen message="Загрузка питомцев..." />;
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Мои питомцы" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <FlatList
          data={pets}
          renderItem={renderPetCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="paw" size={64} color={COLORS.disabled} />
              <Text style={styles.emptyText}>У вас пока нет питомцев</Text>
              <Button label="Добавить питомца" onPress={handleAdd} />
            </View>
          }
        />

        <FAB
          icon="plus"
          style={styles.fab}
          onPress={handleAdd}
        />

        <PetModal
          visible={modalVisible}
          pet={editingPet}
          onDismiss={() => {
            setModalVisible(false);
            setEditingPet(null);
          }}
          onSave={(data) => {
            if (editingPet) {
              updateMutation.mutate({ id: editingPet.id, data });
            } else {
              createMutation.mutate(data);
            }
          }}
          isLoading={createMutation.isPending || updateMutation.isPending}
        />
      </SafeAreaView>
    </>
  );
}

/**
 * Модальное окно создания/редактирования питомца
 */
function PetModal({
  visible,
  pet,
  onDismiss,
  onSave,
  isLoading,
}: {
  visible: boolean;
  pet: Pet | null;
  onDismiss: () => void;
  onSave: (data: CreatePetData) => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"DOG" | "CAT" | "OTHER">("DOG");
  const [breed, setBreed] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [notes, setNotes] = useState("");

  // Сброс формы при открытии/изменении питомца
  useEffect(() => {
    if (visible) {
      if (pet) {
        setName(pet.name || "");
        setType(pet.type || "DOG");
        setBreed(pet.breed || "");
        setBirthDate(pet.birthDate ? new Date(pet.birthDate).toISOString().split("T")[0] : "");
        setHeightCm(pet.heightCm?.toString() || "");
        setWeightKg(pet.weightKg?.toString() || "");
        setNotes(pet.notes || "");
      } else {
        // Сброс для создания нового питомца
        setName("");
        setType("DOG");
        setBreed("");
        setBirthDate("");
        setHeightCm("");
        setWeightKg("");
        setNotes("");
      }
    }
  }, [visible, pet]);

  const handleSave = () => {
    const isEdit = !!pet;
    if (__DEV__) {
      console.log(`${LOG_PREFIX} Начало сохранения питомца через модальное окно`, {
        isEdit,
        petId: pet?.id,
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

    const petData: CreatePetData = {
      name: name.trim(),
      type,
      breed: breed.trim(),
      birthDate: birthDate.trim(),
      heightCm: height,
      weightKg: weight,
      notes: notes.trim() || undefined,
    };

    if (__DEV__) {
      console.log(`${LOG_PREFIX} Валидация пройдена, сохранение питомца`, {
        isEdit,
        petId: pet?.id,
        petData: { ...petData, notes: petData.notes ? "[заметки есть]" : undefined },
      });
    }

    onSave(petData);
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={styles.modalContent}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text variant="titleLarge" style={styles.modalTitle}>
              {pet ? "Редактировать" : "Добавить питомца"}
            </Text>

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
                    style={[
                      styles.typeOption,
                      type === t.value && styles.typeOptionSelected,
                    ]}
                    elevation={type === t.value ? 2 : 0}
                  >
                    <IconButton
                      icon={t.icon}
                      size={24}
                      iconColor={type === t.value ? COLORS.primary : COLORS.textSecondary}
                      onPress={() => setType(t.value)}
                    />
                    <Text
                      style={[
                        styles.typeLabel,
                        type === t.value && styles.typeLabelSelected,
                      ]}
                    >
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

            <View style={styles.modalActions}>
              <Button
                label="Отмена"
                variant="outline"
                onPress={onDismiss}
                style={styles.modalButton}
              />
              <Button
                label={pet ? "Сохранить" : "Добавить"}
                variant="primary"
                onPress={handleSave}
                loading={isLoading}
                disabled={!name.trim() || !breed.trim() || !birthDate.trim() || isLoading}
                style={styles.modalButton}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  listContent: {
    padding: SPACING.md,
    flexGrow: 1,
  },
  petCard: {
    marginBottom: SPACING.sm,
  },
  petContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    minHeight: 80,
  },
  petIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.primary + "15",
    justifyContent: "center",
    alignItems: "center",
    marginRight: SPACING.md,
  },
  petInfo: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  petName: {
    fontWeight: "600",
  },
  petType: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  petBreed: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  petActions: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    marginLeft: SPACING.md,
    flexShrink: 0,
  },
  editButton: {
    margin: 0,
    backgroundColor: "#B6C582",
    borderRadius: 10,
    width: 40,
    height: 40,
    borderWidth: 1,
    borderColor: "#9BA86A",
  },
  deleteButton: {
    margin: 0,
    backgroundColor: "#8B4513",
    borderRadius: 10,
    width: 40,
    height: 40,
    borderWidth: 1,
    borderColor: "#6B3410",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.xxl,
  },
  emptyText: {
    color: COLORS.textSecondary,
    marginVertical: SPACING.lg,
    textAlign: "center",
  },
  fab: {
    position: "absolute",
    right: SPACING.md,
    bottom: SPACING.md,
    backgroundColor: COLORS.primary,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    margin: SPACING.lg,
    padding: 0,
    borderRadius: 16,
    maxHeight: "90%",
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
  },
  modalTitle: {
    marginBottom: SPACING.lg,
    fontWeight: "bold",
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
  modalActions: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  modalButton: {
    flex: 1,
  },
});
