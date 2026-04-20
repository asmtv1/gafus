import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Button, Input, MascotSpinner } from "@/shared/components/ui";
import { petsApi } from "@/shared/lib/api/pets";
import { useNetworkStatus } from "@/shared/hooks/useNetworkStatus";
import { usePreventionSyncStore } from "@/shared/stores/preventionSyncStore";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { BORDER_RADIUS, COLORS, FONTS, SPACING } from "@/constants";

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

const PREVENTION_TYPES: { value: PetPreventionType; label: string; icon: string }[] = [
  { value: "VACCINATION", label: "Прививка", icon: "needle" },
  { value: "DEWORMING", label: "Глистогонка", icon: "pill" },
  { value: "TICKS_FLEAS", label: "Клещи и блохи", icon: "bug-outline" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
const ITEM_H = 44;
const PICKER_HEIGHT = ITEM_H * 5;

function buildPayload(
  type: PetPreventionType,
  performedAt: string,
  productName: string,
  notes: string,
  reminderEnabled: boolean,
  reminderKind: PetPreventionReminderKind,
  reminderDaysAfter: number,
  reminderOnDate: string,
  reminderTimes: string[],
): CreatePreventionEntryData {
  const base: CreatePreventionEntryData = {
    type,
    performedAt,
    productName: productName.trim() || undefined,
    notes: notes.trim() || undefined,
    reminderEnabled,
    reminderKind,
    reminderTimes: reminderTimes.length > 0 ? reminderTimes : ["09:00"],
  };
  if (!reminderEnabled) {
    return base;
  }
  if (reminderKind === "AFTER_DAYS") {
    return { ...base, reminderDaysAfter };
  }
  return { ...base, reminderOnDate };
}

interface ScrollColumnProps {
  items: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

function ScrollColumn({ items, selectedIndex, onSelect }: ScrollColumnProps) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: false });
    }, 80);
    return () => clearTimeout(id);
  }, []);

  const handleScrollEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      const index = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
      const clamped = Math.max(0, Math.min(items.length - 1, index));
      onSelect(clamped);
    },
    [items.length, onSelect],
  );

  return (
    <ScrollView
      ref={scrollRef}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_H}
      decelerationRate="fast"
      nestedScrollEnabled
      scrollEventThrottle={16}
      style={styles.pickerColumn}
      contentContainerStyle={{ paddingVertical: ITEM_H * 2 }}
      onMomentumScrollEnd={handleScrollEnd}
      onScrollEndDrag={handleScrollEnd}
    >
      {items.map((item, i) => (
        <View key={item} style={styles.pickerItem}>
          <Text
            style={[
              styles.pickerItemText,
              i === selectedIndex && styles.pickerItemTextSelected,
            ]}
          >
            {item}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

export default function PreventionScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isOffline } = useNetworkStatus();
  const addToQueue = usePreventionSyncStore((s) => s.addToQueue);

  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<PetPreventionEntry | null>(null);
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
  const [reminderTimes, setReminderTimes] = useState<string[]>(["09:00"]);

  const [showTimePicker, setShowTimePicker] = useState(false);
  const [editingTimeIndex, setEditingTimeIndex] = useState<number>(0);
  const [pickerHour, setPickerHour] = useState(9);
  const [pickerMinute, setPickerMinute] = useState(0);

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
    setReminderTimes(["09:00"]);
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
    setReminderTimes(
      Array.isArray(entry.reminderTimes) && entry.reminderTimes.length > 0
        ? (entry.reminderTimes as string[])
        : ["09:00"],
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
    mutationFn: (entryId: string) =>
      petsApi.deletePreventionEntry(petId, entryId),
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
    if (
      reminderEnabled &&
      reminderKind === "ON_DATE" &&
      !reminderOnDate.trim()
    ) {
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
      reminderTimes,
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

  const openTimePickerFor = (index: number) => {
    const current = reminderTimes[index] ?? "09:00";
    const [h, m] = current.split(":").map(Number);
    setEditingTimeIndex(index);
    setPickerHour(h);
    setPickerMinute(Math.floor(m / 5));
    setShowTimePicker(true);
  };

  const confirmTimePicker = () => {
    const hh = HOURS[pickerHour];
    const mm = MINUTES[pickerMinute];
    const newTime = `${hh}:${mm}`;
    setReminderTimes((prev) => {
      const next = [...prev];
      next[editingTimeIndex] = newTime;
      return next;
    });
    setShowTimePicker(false);
  };

  const addReminderTime = () => {
    if (reminderTimes.length >= 5) {
      Alert.alert("Ограничение", "Максимум 5 напоминаний");
      return;
    }
    setReminderTimes((prev) => [...prev, "18:00"]);
  };

  const removeReminderTime = (index: number) => {
    if (reminderTimes.length <= 1) return;
    setReminderTimes((prev) => prev.filter((_, i) => i !== index));
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

  const getTypeIcon = (t: string) =>
    PREVENTION_TYPES.find((pt) => pt.value === t)?.icon ?? "medical-bag";

  const saving = addMutation.isPending || updateMutation.isPending;

  const handleBack = () => {
    void hapticFeedback.light();
    router.back();
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <Pressable style={styles.backRow} onPress={handleBack} hitSlop={12}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={COLORS.primary} />
          <Text style={styles.backText}>Назад</Text>
        </Pressable>

        {isLoading ? (
          <View style={styles.centerContent}>
            <MascotSpinner size="large" />
            <Text style={styles.loadingText}>Загрузка…</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.heroCard}>
              <Text style={styles.screenTitle}>Записи о процедурах</Text>
              <Text style={styles.hintText}>
                Справочно: не заменяет консультацию ветеринара.
              </Text>
              <Pressable style={styles.primaryButton} onPress={openAdd}>
                <MaterialCommunityIcons
                  name="plus-circle"
                  size={20}
                  color={COLORS.onPrimary}
                />
                <Text style={styles.primaryButtonText}>Добавить запись</Text>
              </Pressable>
            </View>

            {entries.length === 0 ? (
              <View style={styles.listCard}>
                <View style={styles.emptyContainer}>
                  <MaterialCommunityIcons
                    name="clipboard-text-outline"
                    size={48}
                    color={COLORS.placeholder}
                  />
                  <Text style={styles.emptyText}>Записей пока нет</Text>
                  <Text style={styles.emptySubtext}>
                    Добавьте первую запись о процедуре
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.listCard}>
                <Text style={styles.listTitle}>Список записей</Text>
                <View style={styles.list}>
                  {entries.map((entry) => (
                    <View key={entry.id} style={styles.entryCard}>
                      <View style={styles.entryHeader}>
                        <View style={styles.entryTypeRow}>
                          <View style={styles.entryIconCircle}>
                            <MaterialCommunityIcons
                              name={getTypeIcon(entry.type) as any}
                              size={18}
                              color={COLORS.primary}
                            />
                          </View>
                          <View>
                            <Text style={styles.entryType}>
                              {getTypeLabel(entry.type)}
                            </Text>
                            <Text style={styles.entryDate}>
                              {formatDate(entry.performedAt)}
                            </Text>
                          </View>
                        </View>
                      </View>
                      {entry.reminderEnabled && entry.remindAt && (
                        <View style={styles.remindBadge}>
                          <MaterialCommunityIcons
                            name="bell-outline"
                            size={14}
                            color={COLORS.primary}
                          />
                          <Text style={styles.remindBadgeText}>
                            Напоминание: {formatDate(entry.remindAt)}
                            {Array.isArray(entry.reminderTimes) &&
                              entry.reminderTimes.length > 0 &&
                              ` в ${(entry.reminderTimes as string[]).join(", ")}`}
                          </Text>
                        </View>
                      )}
                      {entry.productName && (
                        <Text style={styles.entryDetail}>
                          Препарат: {entry.productName}
                        </Text>
                      )}
                      {entry.notes && (
                        <Text style={styles.entryDetail}>
                          {entry.notes}
                        </Text>
                      )}
                      <View style={styles.entryActions}>
                        <Pressable
                          style={styles.editButton}
                          onPress={() => openEdit(entry)}
                          disabled={saving}
                        >
                          <MaterialCommunityIcons
                            name="pencil-outline"
                            size={18}
                            color={COLORS.primary}
                          />
                          <Text style={styles.editButtonText}>Изменить</Text>
                        </Pressable>
                        <Pressable
                          style={styles.deleteButton}
                          onPress={() => handleDelete(entry)}
                          disabled={deleteMutation.isPending}
                        >
                          <MaterialCommunityIcons
                            name="trash-can-outline"
                            size={18}
                            color={COLORS.error}
                          />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
        )}

        {/* ─── Модалка добавления / редактирования ─── */}
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
            <Pressable
              style={styles.modalDismissArea}
              onPress={() => {
                setShowModal(false);
                setEditingEntry(null);
                resetFormDefaults();
              }}
            />
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <ScrollView
                contentContainerStyle={styles.modalScroll}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="always"
              >
                <Text style={styles.modalTitle}>
                  {editingEntry ? "Изменить запись" : "Добавить запись"}
                </Text>

                {/* Тип */}
                <Text style={styles.sectionLabel}>Тип процедуры</Text>
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
                      <MaterialCommunityIcons
                        name={t.icon as any}
                        size={16}
                        color={
                          type === t.value
                            ? COLORS.onPrimary
                            : COLORS.textSecondary
                        }
                      />
                      <Text
                        style={[
                          styles.typeChipText,
                          type === t.value && styles.typeChipTextSelected,
                        ]}
                        numberOfLines={2}
                        adjustsFontSizeToFit
                        minimumFontScale={0.82}
                      >
                        {t.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Дата */}
                <Input
                  label="Дата процедуры *"
                  value={performedAt}
                  onChangeText={setPerformedAt}
                  placeholder="YYYY-MM-DD"
                />

                {/* Препарат */}
                <Input
                  label="Препарат"
                  value={productName}
                  onChangeText={setProductName}
                  placeholder="Название (необязательно)"
                />

                {/* Заметки */}
                <Input
                  label="Заметки"
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Дополнительно"
                  multiline
                  numberOfLines={2}
                  keyboardDoneAccessory
                />

                {/* Push-напоминание */}
                <View style={styles.switchRow}>
                  <View style={styles.switchLabel}>
                    <MaterialCommunityIcons
                      name="bell-ring-outline"
                      size={20}
                      color={COLORS.primary}
                    />
                    <Text style={styles.switchLabelText}>
                      Push-напоминание
                    </Text>
                  </View>
                  <Pressable
                    style={[
                      styles.toggleTrack,
                      reminderEnabled && styles.toggleTrackActive,
                    ]}
                    onPress={() => setReminderEnabled((v) => !v)}
                  >
                    <View
                      style={[
                        styles.toggleThumb,
                        reminderEnabled && styles.toggleThumbActive,
                      ]}
                    />
                  </Pressable>
                </View>

                {reminderEnabled && (
                  <View style={styles.reminderSection}>
                    {/* Когда */}
                    <Text style={styles.sectionLabel}>Когда напомнить</Text>
                    <View style={styles.kindRow}>
                      <Pressable
                        style={[
                          styles.kindChip,
                          reminderKind === "AFTER_DAYS" &&
                            styles.kindChipSelected,
                        ]}
                        onPress={() => setReminderKind("AFTER_DAYS")}
                      >
                        <MaterialCommunityIcons
                          name="calendar-clock"
                          size={16}
                          color={
                            reminderKind === "AFTER_DAYS"
                              ? COLORS.onPrimary
                              : COLORS.textSecondary
                          }
                        />
                        <Text
                          style={[
                            styles.kindChipText,
                            reminderKind === "AFTER_DAYS" &&
                              styles.kindChipTextSelected,
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
                        <MaterialCommunityIcons
                          name="calendar"
                          size={16}
                          color={
                            reminderKind === "ON_DATE"
                              ? COLORS.onPrimary
                              : COLORS.textSecondary
                          }
                        />
                        <Text
                          style={[
                            styles.kindChipText,
                            reminderKind === "ON_DATE" &&
                              styles.kindChipTextSelected,
                          ]}
                        >
                          Конкретная дата
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

                    {/* Время */}
                    <Text style={styles.sectionLabel}>Во сколько напомнить</Text>
                    {reminderTimes.map((t, idx) => (
                      <View key={idx} style={styles.timeRow}>
                        <Pressable
                          style={styles.timeField}
                          onPress={() => openTimePickerFor(idx)}
                        >
                          <MaterialCommunityIcons
                            name="clock-outline"
                            size={20}
                            color={COLORS.primary}
                          />
                          <Text style={styles.timeFieldText}>{t}</Text>
                          <MaterialCommunityIcons
                            name="chevron-down"
                            size={20}
                            color={COLORS.textSecondary}
                          />
                        </Pressable>
                        {reminderTimes.length > 1 && (
                          <Pressable
                            style={styles.timeRemoveBtn}
                            onPress={() => removeReminderTime(idx)}
                          >
                            <MaterialCommunityIcons
                              name="close-circle"
                              size={22}
                              color={COLORS.error}
                            />
                          </Pressable>
                        )}
                      </View>
                    ))}
                    {reminderTimes.length < 5 && (
                      <Pressable
                        style={styles.addTimeBtn}
                        onPress={addReminderTime}
                      >
                        <MaterialCommunityIcons
                          name="plus"
                          size={18}
                          color={COLORS.primary}
                        />
                        <Text style={styles.addTimeBtnText}>
                          Ещё одно напоминание
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )}

                {/* Кнопки */}
                <View style={styles.modalActions}>
                  <Pressable
                    style={styles.cancelBtn}
                    onPress={() => {
                      setShowModal(false);
                      setEditingEntry(null);
                      resetFormDefaults();
                    }}
                  >
                    <Text style={styles.cancelBtnText}>Отмена</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.saveBtn,
                      (!performedAt || saving) && styles.saveBtnDisabled,
                    ]}
                    onPress={handleSave}
                    disabled={!performedAt || saving}
                  >
                    {saving ? (
                      <Text style={styles.saveBtnText}>Сохранение...</Text>
                    ) : (
                      <Text style={styles.saveBtnText}>Сохранить</Text>
                    )}
                  </Pressable>
                </View>
              </ScrollView>

              {/* Один Modal на iOS: вложенный Modal для времени не открывается — оверлей внутри этой же формы */}
              {showTimePicker && (
                <View style={styles.timePickerOverlay} accessibilityViewIsModal>
                  <Pressable
                    style={styles.timePickerBackdrop}
                    onPress={() => setShowTimePicker(false)}
                    accessibilityLabel="Закрыть выбор времени"
                  />
                  <View style={styles.tpSheet}>
                    <Text style={styles.tpTitle}>Выберите время</Text>
                    <View style={styles.tpPickerContainer}>
                      <View style={styles.tpPickerHighlight} pointerEvents="none" />
                      <ScrollColumn
                        items={HOURS}
                        selectedIndex={pickerHour}
                        onSelect={setPickerHour}
                      />
                      <Text style={styles.tpColon}>:</Text>
                      <ScrollColumn
                        items={MINUTES}
                        selectedIndex={pickerMinute}
                        onSelect={setPickerMinute}
                      />
                    </View>
                    <Pressable style={styles.tpConfirm} onPress={confirmTimePicker}>
                      <Text style={styles.tpConfirmText}>Готово</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
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
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontFamily: FONTS.montserrat,
  },
  scrollContent: {
    padding: SPACING.md,
    paddingTop: 0,
    gap: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  heroCard: {
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
  },
  hintText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
    lineHeight: 16,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: 12,
    marginTop: SPACING.xs,
  },
  primaryButtonText: {
    color: COLORS.onPrimary,
    fontSize: 14,
    fontWeight: "600",
    fontFamily: FONTS.montserrat,
  },
  listCard: {
    backgroundColor: "#F5F0E8",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: "700",
    fontFamily: FONTS.impact,
    color: COLORS.text,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: SPACING.lg,
    gap: SPACING.sm,
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontWeight: "500",
    fontFamily: FONTS.montserrat,
  },
  emptySubtext: {
    color: COLORS.placeholder,
    fontSize: 13,
    fontFamily: FONTS.montserrat,
  },
  list: {
    gap: SPACING.sm,
  },
  entryCard: {
    borderWidth: 1,
    borderColor: "#D4C4A8",
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    backgroundColor: "#fff",
  },
  entryHeader: {
    marginBottom: SPACING.sm,
  },
  entryTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  entryIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  entryType: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.text,
  },
  entryDate: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  remindBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.primary + "10",
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: "flex-start",
    marginBottom: SPACING.xs,
  },
  remindBadgeText: {
    fontSize: 12,
    color: COLORS.primary,
  },
  entryDetail: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  entryActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.borderLight,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  editButtonText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "500",
  },
  deleteButton: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },

  /* ─── Модалка ─── */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalDismissArea: {
    flex: 1,
  },
  modalSheet: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#F5F0E8",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "92%",
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.borderLight,
    alignSelf: "center",
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  modalScroll: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    fontFamily: FONTS.impact,
    color: COLORS.text,
    marginBottom: SPACING.md,
    marginTop: SPACING.sm,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  typeRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: SPACING.md,
  },
  typeChip: {
    flex: 1,
    minWidth: 0,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: COLORS.background,
  },
  typeChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  typeChipText: {
    fontSize: 11,
    fontWeight: "500",
    color: COLORS.textSecondary,
    textAlign: "center",
    width: "100%",
  },
  typeChipTextSelected: {
    color: COLORS.onPrimary,
    fontWeight: "600",
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    backgroundColor: "#FFF",
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: "#D4C4A8",
  },
  switchLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  switchLabelText: {
    fontSize: 15,
    fontWeight: "500",
    color: COLORS.text,
  },
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.borderLight,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  toggleTrackActive: {
    backgroundColor: COLORS.primary,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleThumbActive: {
    alignSelf: "flex-end",
  },
  reminderSection: {
    marginTop: SPACING.xs,
  },
  kindRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  kindChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    backgroundColor: "#FFF",
  },
  kindChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  kindChipText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  kindChipTextSelected: {
    color: COLORS.onPrimary,
    fontWeight: "600",
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  timeField: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: "#FFF",
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
  },
  timeFieldText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    color: COLORS.text,
  },
  timeRemoveBtn: {
    padding: 4,
  },
  addTimeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: SPACING.sm,
  },
  addTimeBtnText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "500",
  },
  modalActions: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: "#D4C4A8",
  },
  cancelBtnText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: "500",
  },
  saveBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primary,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: COLORS.onPrimary,
    fontSize: 15,
    fontWeight: "600",
  },

  /* ─── Time picker (оверлей внутри modalSheet — вложенный Modal на iOS не показывается) ─── */
  timePickerOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: "flex-end",
    zIndex: 100,
    elevation: 100,
  },
  timePickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  tpSheet: {
    backgroundColor: "#F5F0E8",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: SPACING.lg,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
    paddingTop: SPACING.md,
    alignItems: "center",
  },
  tpTitle: {
    fontSize: 17,
    fontWeight: "700",
    fontFamily: FONTS.impact,
    color: COLORS.text,
    marginBottom: SPACING.md,
    alignSelf: "stretch",
  },
  tpPickerContainer: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: PICKER_HEIGHT,
    paddingHorizontal: SPACING.xl,
    alignSelf: "stretch",
  },
  tpPickerHighlight: {
    position: "absolute",
    top: "50%",
    marginTop: -ITEM_H / 2,
    left: SPACING.xl,
    right: SPACING.xl,
    height: ITEM_H,
    backgroundColor: "rgba(99,97,40,0.12)",
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(99,97,40,0.2)",
  },
  tpColon: {
    fontSize: 28,
    fontWeight: "700",
    fontFamily: FONTS.montserrat,
    color: COLORS.text,
    paddingHorizontal: 8,
  },
  tpConfirm: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: 14,
    paddingHorizontal: SPACING.xxl,
    alignSelf: "stretch",
    alignItems: "center",
  },
  tpConfirmText: {
    color: COLORS.onPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
  pickerColumn: {
    width: 72,
    height: PICKER_HEIGHT,
  },
  pickerItem: {
    height: ITEM_H,
    justifyContent: "center",
    alignItems: "center",
  },
  pickerItemText: {
    fontSize: 22,
    fontFamily: FONTS.montserrat,
    color: COLORS.textSecondary,
    fontWeight: "400",
  },
  pickerItemTextSelected: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: 26,
  },
});
