import { useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, TextInput, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, Switch, Snackbar } from "react-native-paper";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { remindersApi } from "@/shared/lib/api";
import { COLORS, FONTS, SPACING } from "@/constants";

export default function RemindersScreen() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [time, setTime] = useState("09:00");
  const [days, setDays] = useState("1,2,3,4,5,6,7");
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
      await queryClient.invalidateQueries({ queryKey: ["reminders"] });
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

  const handleCreate = () => {
    if (!name.trim()) {
      setSnackbar({ visible: true, message: "Введите название напоминания" });
      return;
    }
    if (reminders.length >= 5) {
      setSnackbar({ visible: true, message: "Максимум 5 напоминаний" });
      return;
    }
    createMutation.mutate({
      name: name.trim(),
      reminderTime: time.trim() || "09:00",
      reminderDays: days.trim() || null,
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
          <TextInput
            value={time}
            onChangeText={setTime}
            style={styles.input}
            placeholder="Время (HH:MM)"
            placeholderTextColor={COLORS.textSecondary}
          />
          <TextInput
            value={days}
            onChangeText={setDays}
            style={styles.input}
            placeholder="Дни (например 1,2,3,4,5)"
            placeholderTextColor={COLORS.textSecondary}
          />
          <Pressable style={styles.primaryButton} onPress={handleCreate}>
            <Text style={styles.primaryButtonText}>Добавить</Text>
          </Pressable>
        </View>

        <View style={styles.listCard}>
          <Text style={styles.formTitle}>Список</Text>
          {reminders.map((r) => (
            <View key={r.id} style={styles.item}>
              <View style={styles.itemMeta}>
                <Text style={styles.itemName}>{r.name}</Text>
                <Text style={styles.itemDetail}>
                  {r.reminderTime} • {r.reminderDays ?? "каждый день"}
                </Text>
              </View>
              <Switch
                value={r.enabled}
                onValueChange={(enabled) => updateMutation.mutate({ id: r.id, enabled })}
              />
              <Pressable
                style={styles.deleteBtn}
                onPress={() =>
                  Alert.alert("Удалить напоминание", "Вы уверены?", [
                    { text: "Отмена", style: "cancel" },
                    { text: "Удалить", style: "destructive", onPress: () => deleteMutation.mutate(r.id) },
                  ])
                }
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
  input: {
    borderWidth: 1,
    borderColor: "#D4C4A8",
    borderRadius: 8,
    backgroundColor: "#FFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  primaryButtonText: { color: "#fff", fontWeight: "600" },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    borderRadius: 8,
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

