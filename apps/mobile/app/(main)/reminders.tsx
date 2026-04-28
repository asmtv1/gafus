import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Modal,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Snackbar, Switch, Text } from "react-native-paper";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { BORDER_RADIUS, COLORS, FONTS, SPACING } from "@/constants";
import { remindersApi, type Reminder } from "@/shared/lib/api";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { trackEvent } from "@/shared/lib/analytics";

const DAYS_OF_WEEK = [
  { id: "1", label: "Пн" },
  { id: "2", label: "Вт" },
  { id: "3", label: "Ср" },
  { id: "4", label: "Чт" },
  { id: "5", label: "Пт" },
  { id: "6", label: "Сб" },
  { id: "7", label: "Вс" },
] as const;

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

const ITEM_H = 44;
const VISIBLE_ITEMS = 5;
const PICKER_HEIGHT = ITEM_H * VISIBLE_ITEMS;

function formatReminderDaysLabel(reminderDays: string | null): string {
  if (!reminderDays?.trim()) return "каждый день";
  const ids = reminderDays
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const labels = ids.map((id) => DAYS_OF_WEEK.find((d) => d.id === id)?.label ?? id);
  return labels.join(", ");
}

function reminderDaysForCreate(allDays: boolean, selectedDays: string[]): string | null {
  if (allDays) return null;
  if (selectedDays.length === 0) return null;
  return [...selectedDays].sort((a, b) => Number(a) - Number(b)).join(",");
}

/** IANA timezone устройства для совпадения «16:00» с локальными часами пользователя */
function getDeviceTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && typeof tz === "string") {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return tz;
    }
  } catch {
    /* fallthrough */
  }
  return "Europe/Moscow";
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
    // intentionally run only on mount — не реагируем на изменения извне
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      {items.map((item, i) => {
        const isSelected = i === selectedIndex;
        return (
          <View key={item} style={styles.pickerItem}>
            <Text style={[styles.pickerItemText, isSelected && styles.pickerItemTextSelected]}>
              {item}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

export default function RemindersScreen() {
  const queryClient = useQueryClient();
  const router = useRouter();

  const [name, setName] = useState("");
  const [selectedHour, setSelectedHour] = useState(9);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [allDays, setAllDays] = useState(false);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });
  const [deviceTimeZone, setDeviceTimeZone] = useState(() => getDeviceTimeZone());

  useFocusEffect(
    useCallback(() => {
      setDeviceTimeZone(getDeviceTimeZone());
    }, []),
  );

  const timeString = `${HOURS[selectedHour]}:${MINUTES[selectedMinute]}`;

  const remindersQuery = useQuery({
    queryKey: ["reminders"],
    queryFn: remindersApi.getAll,
  });

  const reminders = useMemo(
    () => (remindersQuery.data?.success ? (remindersQuery.data.data ?? []) : []),
    [remindersQuery.data],
  );

  const createMutation = useMutation({
    mutationFn: remindersApi.create,
    onSuccess: async (res) => {
      if (!res.success) {
        setSnackbar({ visible: true, message: res.error ?? "Ошибка создания напоминания" });
        return;
      }
      setName("");
      setSelectedHour(9);
      setSelectedMinute(0);
      setAllDays(false);
      setSelectedDays([]);
      await queryClient.invalidateQueries({ queryKey: ["reminders"] });
      trackEvent({
        eventName: "button_click",
        platform: "mobile",
        pathOrScreen: "/reminders",
        elementId: "training-reminder-create-success",
      });
      void hapticFeedback.success();
      setSnackbar({ visible: true, message: "Напоминание добавлено" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      remindersApi.update(id, { enabled }),
    onSuccess: async (res) => {
      if (!res.success) {
        setSnackbar({ visible: true, message: res.error ?? "Ошибка обновления напоминания" });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["reminders"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: remindersApi.remove,
    onSuccess: async (res) => {
      if (!res.success) {
        setSnackbar({ visible: true, message: res.error ?? "Ошибка удаления напоминания" });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["reminders"] });
      setSnackbar({ visible: true, message: "Напоминание удалено" });
    },
  });

  const handleToggleAllDays = () => {
    void hapticFeedback.selection();
    const next = !allDays;
    setAllDays(next);
    if (next) setSelectedDays([]);
  };

  const handleDayChipPress = (dayId: string) => {
    void hapticFeedback.selection();
    if (allDays) {
      setAllDays(false);
      setSelectedDays([dayId]);
      return;
    }
    setSelectedDays((prev) => {
      const next = prev.includes(dayId)
        ? prev.filter((d) => d !== dayId)
        : [...prev, dayId].sort((a, b) => Number(a) - Number(b));
      return next;
    });
  };

  const handleCreate = () => {
    if (!name.trim()) {
      setSnackbar({ visible: true, message: "Введите название напоминания" });
      return;
    }
    if (reminders.length >= 5) {
      setSnackbar({ visible: true, message: "Максимум 5 напоминаний" });
      return;
    }
    if (!allDays && selectedDays.length === 0) {
      setSnackbar({
        visible: true,
        message: "Выберите дни недели или включите «Все дни»",
      });
      return;
    }

    createMutation.mutate({
      name: name.trim(),
      reminderTime: timeString,
      reminderDays: reminderDaysForCreate(allDays, selectedDays),
      timezone: deviceTimeZone,
    });
    trackEvent({
      eventName: "button_click",
      platform: "mobile",
      pathOrScreen: "/reminders",
      elementId: "training-reminder-create-submit",
    });
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <Pressable
          style={styles.backRow}
          onPress={() => {
            void hapticFeedback.light();
            router.back();
          }}
          hitSlop={12}
        >
          <MaterialCommunityIcons name="chevron-left" size={28} color={COLORS.primary} />
          <Text style={styles.backText}>Назад</Text>
        </Pressable>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.formCard}>
            <Text style={styles.screenTitle}>Напоминания</Text>

            <TextInput
              value={name}
              onChangeText={setName}
              style={styles.input}
              placeholder="Название напоминания"
              placeholderTextColor={COLORS.disabled}
              maxLength={100}
            />

            <Text style={styles.fieldLabel}>Время</Text>
            <Pressable
              style={styles.timeField}
              onPress={() => setShowTimePicker(true)}
              accessibilityRole="button"
              accessibilityLabel={`Выбрать время: ${timeString}`}
            >
              <MaterialCommunityIcons name="clock-outline" size={20} color={COLORS.primary} />
              <Text style={styles.timeFieldText}>{timeString}</Text>
              <MaterialCommunityIcons name="chevron-down" size={18} color={COLORS.disabled} />
            </Pressable>
            <Text style={styles.timezoneHint}>
              По времени телефона ({deviceTimeZone.replace(/_/g, " ")})
            </Text>

            <Text style={styles.fieldLabel}>Дни недели</Text>

            <Pressable
              style={[styles.allDaysToggle, allDays && styles.allDaysToggleActive]}
              onPress={handleToggleAllDays}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: allDays }}
            >
              <MaterialCommunityIcons
                name={allDays ? "checkbox-marked" : "checkbox-blank-outline"}
                size={20}
                color={allDays ? COLORS.onPrimary : COLORS.primary}
              />
              <Text style={[styles.allDaysText, allDays && styles.allDaysTextActive]}>
                Все дни
              </Text>
            </Pressable>

            <View style={styles.daysRow}>
              {DAYS_OF_WEEK.map((day) => {
                const selected = !allDays && selectedDays.includes(day.id);
                return (
                  <Pressable
                    key={day.id}
                    onPress={() => handleDayChipPress(day.id)}
                    style={[
                      styles.dayChip,
                      selected && styles.dayChipSelected,
                      allDays && styles.dayChipDisabled,
                    ]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`${day.label}, ${selected ? "выбран" : "не выбран"}`}
                  >
                    <Text
                      style={[styles.dayChipText, selected && styles.dayChipTextSelected]}
                    >
                      {day.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              style={styles.primaryButton}
              onPress={handleCreate}
              disabled={createMutation.isPending}
            >
              <Text style={styles.primaryButtonText}>
                {createMutation.isPending ? "Добавление..." : "Добавить"}
              </Text>
            </Pressable>
          </View>

          {reminders.length > 0 && (
            <View style={styles.listCard}>
              <Text style={styles.listTitle}>Список напоминаний</Text>
              {reminders.map((r: Reminder) => (
                <View key={r.id} style={styles.item}>
                  <View style={styles.itemMeta}>
                    <Text style={styles.itemName}>{r.name}</Text>
                    <Text style={styles.itemDetail}>
                      {r.reminderTime} • {formatReminderDaysLabel(r.reminderDays)}
                    </Text>
                  </View>
                  <Switch
                    value={r.enabled}
                    color={COLORS.primary}
                    onValueChange={(enabled) => {
                      void hapticFeedback.selection();
                      trackEvent({
                        eventName: "button_click",
                        platform: "mobile",
                        pathOrScreen: "/reminders",
                        elementId: enabled ? "training-reminder-enabled" : "training-reminder-disabled",
                      });
                      updateMutation.mutate({ id: r.id, enabled });
                    }}
                  />
                  <Pressable
                    style={styles.deleteBtn}
                    onPress={() => {
                      void hapticFeedback.light();
                      Alert.alert("Удалить напоминание", "Вы уверены?", [
                        { text: "Отмена", style: "cancel" },
                        {
                          text: "Удалить",
                          style: "destructive",
                          onPress: () => deleteMutation.mutate(r.id),
                        },
                      ]);
                    }}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={18} color="#B00020" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Time picker modal */}
        <Modal
          visible={showTimePicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowTimePicker(false)}
        >
          <View style={styles.modalOverlay}>
            {/* Область для закрытия по тапу на фон */}
            <Pressable style={styles.modalDismissArea} onPress={() => setShowTimePicker(false)} />
            {/* Sheet — обычный View, чтобы не блокировать scroll */}
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Выберите время</Text>
                <Pressable onPress={() => setShowTimePicker(false)}>
                  <Text style={styles.modalDone}>Готово</Text>
                </Pressable>
              </View>

              <View style={styles.pickerContainer}>
                <View style={styles.pickerHighlight} pointerEvents="none" />
                <ScrollColumn
                  items={HOURS}
                  selectedIndex={selectedHour}
                  onSelect={setSelectedHour}
                />
                <Text style={styles.pickerSeparator}>:</Text>
                <ScrollColumn
                  items={MINUTES}
                  selectedIndex={selectedMinute}
                  onSelect={setSelectedMinute}
                />
              </View>
            </View>
          </View>
        </Modal>

        <Snackbar
          visible={snackbar.visible}
          onDismiss={() => setSnackbar({ visible: false, message: "" })}
        >
          {snackbar.message}
        </Snackbar>
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
  scrollContent: {
    padding: SPACING.md,
    paddingTop: 0,
    gap: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  screenTitle: {
    fontSize: 24,
    fontFamily: FONTS.impact,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  formCard: {
    backgroundColor: "#F5F0E8",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    padding: SPACING.md,
    gap: SPACING.sm,
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
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
    marginTop: 4,
  },
  timezoneHint: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
    marginTop: 4,
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
  timeField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: "#FFF",
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
  },
  timeFieldText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
  },
  allDaysToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: "transparent",
  },
  allDaysToggleActive: {
    backgroundColor: COLORS.primary,
  },
  allDaysText: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: FONTS.montserrat,
    color: COLORS.primary,
  },
  allDaysTextActive: {
    color: COLORS.onPrimary,
  },
  daysRow: {
    flexDirection: "row",
    gap: 6,
  },
  dayChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#FFF",
    alignItems: "center",
  },
  dayChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  dayChipDisabled: {
    opacity: 0.4,
  },
  dayChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
  },
  dayChipTextSelected: {
    color: COLORS.onPrimary,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: SPACING.xs,
  },
  primaryButtonText: {
    color: COLORS.onPrimary,
    fontWeight: "600",
    fontFamily: FONTS.montserrat,
    fontSize: 14,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    backgroundColor: "#fff",
  },
  itemMeta: { flex: 1 },
  itemName: {
    color: COLORS.text,
    fontWeight: "600",
    fontFamily: FONTS.montserrat,
    fontSize: 13,
  },
  itemDetail: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontFamily: FONTS.montserrat,
    marginTop: 2,
  },
  deleteBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: "#FDEAEA",
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalDismissArea: {
    flex: 1,
  },
  modalSheet: {
    backgroundColor: "#F5F0E8",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: SPACING.xl,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: "#D4C4A8",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    fontFamily: FONTS.impact,
    color: COLORS.text,
  },
  modalDone: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
    fontFamily: FONTS.montserrat,
  },
  pickerContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.xl,
    position: "relative",
  },
  pickerHighlight: {
    position: "absolute",
    top: "50%",
    left: SPACING.xl,
    right: SPACING.xl,
    height: ITEM_H,
    marginTop: -ITEM_H / 2,
    backgroundColor: "rgba(99,97,40,0.12)",
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(99,97,40,0.2)",
  },
  pickerColumn: {
    height: PICKER_HEIGHT,
    width: 72,
  },
  pickerItem: {
    height: ITEM_H,
    justifyContent: "center",
    alignItems: "center",
  },
  pickerItemSelected: {},
  pickerItemText: {
    fontSize: 22,
    fontFamily: FONTS.montserrat,
    color: COLORS.textSecondary,
    fontWeight: "400",
  },
  pickerItemTextSelected: {
    fontSize: 26,
    fontWeight: "700",
    color: COLORS.text,
  },
  pickerSeparator: {
    fontSize: 28,
    fontWeight: "700",
    color: COLORS.text,
    paddingHorizontal: 8,
    fontFamily: FONTS.montserrat,
  },
});
