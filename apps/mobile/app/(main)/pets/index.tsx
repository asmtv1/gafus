import { useState, useCallback } from "react";
import { View, StyleSheet, FlatList, RefreshControl, Alert } from "react-native";
import { Text, FAB, Portal, Modal, Surface, IconButton } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Card, Loading, Button, Input } from "@/shared/components/ui";
import { petsApi, type Pet, type CreatePetData } from "@/shared/lib/api";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { COLORS, SPACING } from "@/constants";

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
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["pets"],
    queryFn: petsApi.getAll,
  });

  // Создание питомца
  const createMutation = useMutation({
    mutationFn: petsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pets"] });
      setModalVisible(false);
      hapticFeedback.success();
    },
  });

  // Обновление питомца
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreatePetData> }) =>
      petsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pets"] });
      setModalVisible(false);
      setEditingPet(null);
      hapticFeedback.success();
    },
  });

  // Удаление питомца
  const deleteMutation = useMutation({
    mutationFn: petsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pets"] });
      hapticFeedback.success();
    },
  });

  const handleDelete = (pet: Pet) => {
    Alert.alert(
      "Удалить питомца",
      `Вы уверены, что хотите удалить ${pet.name}?`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: () => deleteMutation.mutate(pet.id),
        },
      ]
    );
  };

  const handleEdit = (pet: Pet) => {
    setEditingPet(pet);
    setModalVisible(true);
  };

  const handleAdd = () => {
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
              size={20}
              onPress={() => handleEdit(item)}
            />
            <IconButton
              icon="delete"
              size={20}
              iconColor={COLORS.error}
              onPress={() => handleDelete(item)}
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
  const [name, setName] = useState(pet?.name || "");
  const [type, setType] = useState<"DOG" | "CAT" | "OTHER">(pet?.type || "DOG");
  const [breed, setBreed] = useState(pet?.breed || "");

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      type,
      breed: breed.trim() || undefined,
    });
  };

  // Сброс формы при открытии
  useState(() => {
    if (visible) {
      setName(pet?.name || "");
      setType(pet?.type || "DOG");
      setBreed(pet?.breed || "");
    }
  });

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={styles.modalContent}
      >
        <Text variant="titleLarge" style={styles.modalTitle}>
          {pet ? "Редактировать" : "Добавить питомца"}
        </Text>

        <Input
          label="Имя питомца"
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.fieldLabel}>Тип</Text>
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
          label="Порода (необязательно)"
          value={breed}
          onChangeText={setBreed}
        />

        <View style={styles.modalActions}>
          <Button
            label="Отмена"
            mode="outlined"
            onPress={onDismiss}
            style={styles.modalButton}
          />
          <Button
            label={pet ? "Сохранить" : "Добавить"}
            onPress={handleSave}
            loading={isLoading}
            disabled={!name.trim() || isLoading}
            style={styles.modalButton}
          />
        </View>
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
    flexDirection: "row",
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
    padding: SPACING.lg,
    borderRadius: 16,
  },
  modalTitle: {
    marginBottom: SPACING.lg,
    fontWeight: "bold",
  },
  fieldLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
    marginTop: SPACING.sm,
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
