import { useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, TextInput, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Checkbox, Snackbar, Switch, Text } from "react-native-paper";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { BORDER_RADIUS, COLORS, FONTS, SPACING } from "@/constants";
import { remindersApi, type Reminder } from "@/shared/lib/api";
import { hapticFeedback } from "@/shared/lib/utils/haptics";

/** Как на web TrainingReminders: 1 = Пн … 7 = Вс */
const DAYS_OF_WEEK = [
  { id: "1", label: "Пн" },
  { id: "2", label: "Вт" },
  { id: "3", label: "Ср" },
  { id: "4", label: "Чт" },
  { id: "5", label: "Пт" },
  { id: "6", label: "Сб" },
  { id: "7", label: "Вс" },
] as const;

function formatReminderDaysLabel(reminderDays: string | null): string {
  if (!reminderDays?.trim()) return "каждый день";
  const ids = reminderDays.split(",").map((s) => s.trim()).filter(Boolean);
  const labels = ids.map(
    (id) => DAYS_OF_WEEK.find((d) => d.id === id)?.label ?? id,
  );
  return labels.join(", ");
}

function reminderDaysForCreate(allDays: boolean, selectedDays: string[]): string | null {
  if (allDays) return null;
  if (selectedDays.length === 0) return null;
  return [...selectedDays].sort((a, b) => Number(a) - Number(b)).join(",");
}

export default function RemindersScreen() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [time, setTime] = useState("09:00");
  const [allDays, setAllDays] = useState(true);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

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
      setTime("09:00");
      setAllDays(true);
      setSelectedDays([]);
      await queryClient.invalidateQueries({ queryKey: ["reminders"] });
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
      reminderTime: time.trim() || "09:00",
      reminderDays: reminderDaysForCreate(allDays, selectedDays),
      timezone: "Europe/Moscow",
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Напоминания</Text>

        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Добавить напоминание</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            style={styles.input}
            placeholder="Название"
            placeholderTextColor={COLORS.textSecondary}
          />
          <Text style={styles.fieldLabel}>Время</Text>
          <TextInput
            value={time}
            onChangeText={setTime}
            style={styles.input}
            placeholder="ЧЧ:ММ"
            placeholderTextColor={COLORS.textSecondary}
          />

          <Text style={styles.fieldLabel}>Дни</Text>
          <Checkbox.Item
            label="Все дни"
            status={allDays ? "checked" : "unchecked"}
            onPress={handleToggleAllDays}
            position="leading"
            style={styles.checkboxItem}
            labelStyle={styles.checkboxLabel}
          />

          {!allDays && (
            <View style={styles.daysGrid}>
              {DAYS_OF_WEEK.map((day) => {
                const selected = selectedDays.includes(day.id);
                return (
                  <Pressable
                    key={day.id}
                    onPress={() => handleDayChipPress(day.id)}
                    style={[styles.dayChip, selected && styles.dayChipSelected]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`${day.label}, ${selected ? "выбран" : "не выбран"}`}
                  >
                    <Text style={[styles.dayChipText, selected && styles.dayChipTextSelected]}>
                      {day.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Pressable style={styles.primaryButton} onPress={handleCreate}>
            <Text style={styles.primaryButtonText}>Добавить</Text>
          </Pressable>
        </View>

        <View style={styles.listCard}>
          <Text style={styles.formTitle}>Список</Text>
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
                onValueChange={(enabled) => {
                  void hapticFeedback.selection();
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
                <Text style={styles.deleteBtnText}>Удалить</Text>
              </Pressable>
            </View>
          ))}
          {reminders.length === 0 && <Text style={styles.empty}>Пока нет напоминаний</Text>}
        </View>
      </ScrollView>
      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: "" })}
      >
        {snackbar.message}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { padding: SPACING.md, gap: SPACING.md },
  title: {
    fontSize: 28,
    fontFamily: FONTS.impact,
    color: COLORS.text,
    textAlign: "center",
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
  formTitle: { fontSize: 16, fontWeight: "700", color: COLORS.text },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D4C4A8",
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: "#FFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
  },
  checkboxItem: {
    marginVertical: 0,
    marginHorizontal: -SPACING.sm,
    paddingVertical: 0,
  },
  checkboxLabel: { color: COLORS.text },
  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    marginTop: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  dayChip: {
    minWidth: 44,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardBackground,
    alignItems: "center",
  },
  dayChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  dayChipText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
  },
  dayChipTextSelected: {
    color: COLORS.onPrimary,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: SPACING.sm,
  },
  primaryButtonText: { color: "#fff", fontWeight: "600" },
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
  itemName: { color: COLORS.text, fontWeight: "600" },
  itemDetail: { color: COLORS.textSecondary, fontSize: 12 },
  deleteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#FDEAEA",
  },
  deleteBtnText: { color: "#B00020", fontSize: 12, fontWeight: "600" },
  empty: { color: COLORS.textSecondary },
});
