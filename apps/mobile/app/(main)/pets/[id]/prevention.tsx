import { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from "react-native";
import { Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Button, Input } from "@/shared/components/ui";
import { petsApi } from "@/shared/lib/api/pets";
import { useNetworkStatus } from "@/shared/hooks/useNetworkStatus";
import { usePreventionSyncStore } from "@/shared/stores/preventionSyncStore";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { COLORS, SPACING } from "@/constants";

import type {
  PetPreventionType,
  PetPreventionEntry,
  CreatePreventionEntryData,
  PetPreventionReminderKind,
} from "@/shared/lib/api/pets";

const DEFAULT_REMINDER_DAYS: Record<PetPreventionType, number> = {
  VACCINATION: 365,
  DEWORMING: 90,
  TICKS_FLEAS: 30,
};

const PREVENTION_TYPES: { value: PetPreventionType; label: string }[] = [
  { value: "VACCINATION", label: "Прививка" },
  { value: "DEWORMING", label: "Глистогонка" },
  { value: "TICKS_FLEAS", label: "Клещи и блохи" },
];

function buildPayload(
  type: PetPreventionType,
  performedAt: string,
  productName: string,
  notes: string,
  reminderEnabled: boolean,
  reminderKind: PetPreventionReminderKind,
  reminderDaysAfter: number,
  reminderOnDate: string,
): CreatePreventionEntryData {
  const base: CreatePreventionEntryData = {
    type,
    performedAt,
    productName: productName.trim() || undefined,
    notes: notes.trim() || undefined,
    reminderEnabled,
    reminderKind,
  };
  if (!reminderEnabled) {
    return base;
  }
  if (reminderKind === "AFTER_DAYS") {
    return { ...base, reminderDaysAfter };
  }
  return { ...base, reminderOnDate };
}

/**
 * Экран записей о процедурах питомца
 */
export default function PreventionScreen() {
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isOffline } = useNetworkStatus();
  const addToQueue = usePreventionSyncStore((s) => s.addToQueue);

  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<PetPreventionEntry | null>(
    null,
  );
  const [type, setType] = useState<PetPreventionType>("VACCINATION");
  const [performedAt, setPerformedAt] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [productName, setProductName] = useState("");
  const [notes, setNotes] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderKind, setReminderKind] =
    useState<PetPreventionReminderKind>("AFTER_DAYS");
  const [reminderDaysAfter, setReminderDaysAfter] = useState(
    DEFAULT_REMINDER_DAYS.VACCINATION,
  );
  const [reminderOnDate, setReminderOnDate] = useState(
    new Date().toISOString().split("T")[0],
  );

  const petId = id ?? "";

  const { data: entriesData, isLoading } = useQuery({
    queryKey: ["petPrevention", petId],
    queryFn: () => petsApi.getPreventionEntries(petId),
    enabled: !!petId,
  });

  const resetFormDefaults = () => {
    setType("VACCINATION");
    setPerformedAt(new Date().toISOString().split("T")[0]);
    setProductName("");
    setNotes("");
    setReminderEnabled(true);
    setReminderKind("AFTER_DAYS");
    setReminderDaysAfter(DEFAULT_REMINDER_DAYS.VACCINATION);
    setReminderOnDate(new Date().toISOString().split("T")[0]);
  };

  const openAdd = () => {
    setEditingEntry(null);
    resetFormDefaults();
    setShowModal(true);
  };

  const openEdit = (entry: PetPreventionEntry) => {
    setEditingEntry(entry);
    setType(entry.type);
    setPerformedAt(entry.performedAt.split("T")[0]);
    setProductName(entry.productName ?? "");
    setNotes(entry.notes ?? "");
    setReminderEnabled(entry.reminderEnabled ?? true);
    setReminderKind(entry.reminderKind ?? "AFTER_DAYS");
    setReminderDaysAfter(
      entry.reminderDaysAfter ?? DEFAULT_REMINDER_DAYS[entry.type],
    );
    setReminderOnDate(
      entry.reminderOnDate
        ? entry.reminderOnDate.split("T")[0]
        : new Date().toISOString().split("T")[0],
    );
    setShowModal(true);
  };

  useEffect(() => {
    if (!editingEntry && showModal) {
      setReminderDaysAfter(DEFAULT_REMINDER_DAYS[type]);
    }
  }, [type, editingEntry, showModal]);

  const addMutation = useMutation({
    mutationFn: (data: CreatePreventionEntryData) =>
      petsApi.addPreventionEntry(petId, data),
    onSuccess: (res) => {
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ["petPrevention", petId] });
        hapticFeedback.success();
        setShowModal(false);
        resetFormDefaults();
      } else {
        Alert.alert("Ошибка", res.error ?? "Не удалось добавить запись");
      }
    },
    onError: (error) => {
      Alert.alert(
        "Ошибка",
        error instanceof Error ? error.message : "Не удалось добавить запись",
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      entryId,
      data,
    }: {
      entryId: string;
      data: Partial<CreatePreventionEntryData>;
    }) => petsApi.updatePreventionEntry(petId, entryId, data),
    onSuccess: (res) => {
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ["petPrevention", petId] });
        hapticFeedback.success();
        setShowModal(false);
        setEditingEntry(null);
        resetFormDefaults();
      } else {
        Alert.alert("Ошибка", res.error ?? "Не удалось сохранить запись");
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (entryId: string) => petsApi.deletePreventionEntry(petId, entryId),
    onSuccess: (res) => {
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ["petPrevention", petId] });
        hapticFeedback.success();
      } else {
        Alert.alert("Ошибка", res.error ?? "Не удалось удалить запись");
      }
    },
  });

  const handleSave = () => {
    if (!performedAt.trim()) {
      Alert.alert("Ошибка", "Дата обязательна");
      return;
    }
    if (reminderEnabled && reminderKind === "ON_DATE" && !reminderOnDate.trim()) {
      Alert.alert("Ошибка", "Укажите дату напоминания");
      return;
    }

    const data = buildPayload(
      type,
      performedAt,
      productName,
      notes,
      reminderEnabled,
      reminderKind,
      reminderDaysAfter,
      reminderOnDate,
    );

    if (editingEntry) {
      updateMutation.mutate({ entryId: editingEntry.id, data });
      return;
    }

    if (isOffline) {
      addToQueue(petId, data);
      queryClient.invalidateQueries({ queryKey: ["petPrevention", petId] });
      hapticFeedback.success();
      setShowModal(false);
      resetFormDefaults();
    } else {
      addMutation.mutate(data);
    }
  };

  const handleDelete = (entry: PetPreventionEntry) => {
    Alert.alert(
      "Удалить запись?",
      `Удалить запись от ${new Date(entry.performedAt).toLocaleDateString("ru-RU")}?`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: () => deleteMutation.mutate(entry.id),
        },
      ],
    );
  };

  const entries = entriesData?.data ?? [];
  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  const getTypeLabel = (t: string) =>
    PREVENTION_TYPES.find((pt) => pt.value === t)?.label ?? t;

  const saving = addMutation.isPending || updateMutation.isPending;

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Записи о процедурах" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <Text style={styles.disclaimer}>
          Справочно: не заменяет консультацию ветеринара.
        </Text>
        {isLoading ? (
          <View style={styles.centerContent}>
            <Text>Загрузка...</Text>
          </View>
        ) : (
          <>
            <View style={styles.headerActions}>
              <Button
                label="Добавить запись"
                variant="primary"
                onPress={openAdd}
              />
            </View>
            <ScrollView contentContainerStyle={styles.scrollContent}>
              {entries.length === 0 ? (
                <Text style={styles.emptyText}>Записей пока нет</Text>
              ) : (
                <View style={styles.list}>
                  {entries.map((entry) => (
                    <View key={entry.id} style={styles.entryCard}>
                      <View style={styles.entryHeader}>
                        <Text style={styles.entryType}>{getTypeLabel(entry.type)}</Text>
                        <Text style={styles.entryDate}>{formatDate(entry.performedAt)}</Text>
                      </View>
                      {entry.reminderEnabled && entry.remindAt && (
                        <Text style={styles.remindLine}>
                          Напоминание: {formatDate(entry.remindAt)}
                        </Text>
                      )}
                      {entry.productName && (
                        <Text style={styles.entryDetail}>Препарат: {entry.productName}</Text>
                      )}
                      {entry.notes && (
                        <Text style={styles.entryDetail}>Заметки: {entry.notes}</Text>
                      )}
                      <View style={styles.entryActions}>
                        <Pressable
                          style={styles.editButton}
                          onPress={() => openEdit(entry)}
                          disabled={saving}
                        >
                          <Text style={styles.editButtonText}>Изменить</Text>
                        </Pressable>
                        <Pressable
                          style={styles.deleteButton}
                          onPress={() => handleDelete(entry)}
                          disabled={deleteMutation.isPending}
                        >
                          <Text style={styles.deleteButtonText}>Удалить</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </>
        )}

        <Modal
          visible={showModal}
          animationType="slide"
          transparent
          onRequestClose={() => {
            setShowModal(false);
            setEditingEntry(null);
          }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalOverlay}
          >
            <ScrollView contentContainerStyle={styles.modalScroll}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>
                  {editingEntry ? "Изменить запись" : "Добавить запись"}
                </Text>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Тип</Text>
                  <View style={styles.typeRow}>
                    {PREVENTION_TYPES.map((t) => (
                      <Pressable
                        key={t.value}
                        style={[
                          styles.typeChip,
                          type === t.value && styles.typeChipSelected,
                        ]}
                        onPress={() => setType(t.value)}
                      >
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
                </View>
                <Input
                  label="Дата *"
                  value={performedAt}
                  onChangeText={setPerformedAt}
                  placeholder="YYYY-MM-DD"
                />
                <Input
                  label="Препарат"
                  value={productName}
                  onChangeText={setProductName}
                  placeholder="Название препарата (опционально)"
                />
                <Input
                  label="Заметки"
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Дополнительные заметки"
                  multiline
                  numberOfLines={2}
                />
                <View style={styles.switchRow}>
                  <Text style={styles.formLabel}>Push-напоминание</Text>
                  <Switch
                    value={reminderEnabled}
                    onValueChange={setReminderEnabled}
                  />
                </View>
                {reminderEnabled && (
                  <>
                    <Text style={styles.formLabel}>Когда напомнить</Text>
                    <View style={styles.kindRow}>
                      <Pressable
                        style={[
                          styles.kindChip,
                          reminderKind === "AFTER_DAYS" && styles.kindChipSelected,
                        ]}
                        onPress={() => setReminderKind("AFTER_DAYS")}
                      >
                        <Text
                          style={[
                            styles.kindChipText,
                            reminderKind === "AFTER_DAYS" && styles.kindChipTextSelected,
                          ]}
                        >
                          Через N дней
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.kindChip,
                          reminderKind === "ON_DATE" && styles.kindChipSelected,
                        ]}
                        onPress={() => setReminderKind("ON_DATE")}
                      >
                        <Text
                          style={[
                            styles.kindChipText,
                            reminderKind === "ON_DATE" && styles.kindChipTextSelected,
                          ]}
                        >
                          Дата
                        </Text>
                      </Pressable>
                    </View>
                    {reminderKind === "AFTER_DAYS" && (
                      <Input
                        label="Дней после процедуры"
                        value={String(reminderDaysAfter)}
                        onChangeText={(v) =>
                          setReminderDaysAfter(parseInt(v, 10) || 1)
                        }
                        keyboardType="number-pad"
                      />
                    )}
                    {reminderKind === "ON_DATE" && (
                      <Input
                        label="Дата напоминания *"
                        value={reminderOnDate}
                        onChangeText={setReminderOnDate}
                        placeholder="YYYY-MM-DD"
                      />
                    )}
                  </>
                )}
                <View style={styles.modalActions}>
                  <Button
                    label="Отмена"
                    variant="outline"
                    onPress={() => {
                      setShowModal(false);
                      setEditingEntry(null);
                      resetFormDefaults();
                    }}
                    style={styles.modalButton}
                  />
                  <Button
                    label="Сохранить"
                    variant="primary"
                    onPress={handleSave}
                    loading={saving}
                    disabled={!performedAt || saving}
                    style={styles.modalButton}
                  />
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  disclaimer: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.xl,
  },
  headerActions: {
    padding: SPACING.md,
  },
  scrollContent: {
    padding: SPACING.md,
  },
  emptyText: {
    color: COLORS.textSecondary,
    textAlign: "center",
    padding: SPACING.xl,
  },
  list: {
    gap: SPACING.md,
  },
  entryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  entryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  entryType: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
  },
  entryDate: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  remindLine: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  entryDetail: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  entryActions: {
    flexDirection: "row",
    gap: SPACING.md,
    marginTop: SPACING.sm,
  },
  editButton: {
    paddingVertical: 6,
  },
  editButtonText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  deleteButton: {
    paddingVertical: 6,
  },
  deleteButtonText: {
    color: COLORS.error,
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalScroll: {
    flexGrow: 1,
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: SPACING.lg,
    paddingBottom: SPACING.xl + 20,
    maxHeight: "92%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: SPACING.lg,
    color: COLORS.text,
  },
  formGroup: {
    marginBottom: SPACING.md,
  },
  formLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  typeRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  typeChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    alignItems: "center",
  },
  typeChipSelected: {
    backgroundColor: COLORS.primary + "20",
    borderColor: COLORS.primary,
  },
  typeChipText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  typeChipTextSelected: {
    color: COLORS.primary,
    fontWeight: "600",
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: SPACING.sm,
  },
  kindRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  kindChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    alignItems: "center",
  },
  kindChipSelected: {
    backgroundColor: COLORS.primary + "20",
    borderColor: COLORS.primary,
  },
  kindChipText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  kindChipTextSelected: {
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
