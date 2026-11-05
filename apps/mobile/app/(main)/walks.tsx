import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { Text } from "react-native-paper";
import { TexturedSafeAreaView } from "@/shared/components";
import { COLORS, SPACING } from "@/shared/config";
import { useAuthStore } from "@/shared/stores/authStore";
import { canUseDogWalkHistory } from "@/features/walk/walkAccess";
import { toWalkHistoryRows } from "@/features/walk/walkHistoryFormat";
import { loadWalkJournal, type WalkJournal } from "@/features/walk/walkStorage";
import { syncDogWalkHistory } from "@/features/walk/walkSync";
import { reportClientError } from "@/shared/lib/tracer";

export default function WalksHistoryScreen() {
  const router = useRouter();
  const actor = useAuthStore((state) =>
    state.isAuthenticated &&
    !state.isLoading &&
    state.verifiedSessionEpoch &&
    canUseDogWalkHistory(state.user)
      ? (state.user?.id ?? null)
      : null,
  );
  const [journal, setJournal] = useState<WalkJournal | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [syncWarning, setSyncWarning] = useState(false);

  const refresh = useCallback(async (id: string) => {
    setRefreshing(true);
    try {
      // Local first: the list stays usable with no network.
      const local = await loadWalkJournal(id);
      if (useAuthStore.getState().user?.id !== id) return;
      setJournal(local);
      try {
        const merged = await syncDogWalkHistory(id);
        if (useAuthStore.getState().user?.id === id) {
          setJournal(merged);
          setSyncWarning(false);
        }
      } catch (error) {
        reportClientError(error, { issueKey: "DogWalkServerSync" });
        if (useAuthStore.getState().user?.id === id) setSyncWarning(true);
      }
    } catch (error) {
      reportClientError(error, { issueKey: "DogWalkServerSync" });
      if (useAuthStore.getState().user?.id === id) setSyncWarning(true);
    } finally {
      if (useAuthStore.getState().user?.id === id) setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (actor) void refresh(actor);
      else setJournal(null);
    }, [actor, refresh]),
  );

  if (!actor) {
    return (
      <TexturedSafeAreaView style={styles.page}>
        <View style={styles.content}>
          <Text style={styles.heading}>Прогулки</Text>
          <Text>Раздел пока недоступен для этого аккаунта.</Text>
        </View>
      </TexturedSafeAreaView>
    );
  }
  const rows = toWalkHistoryRows(journal?.completed ?? []);
  return (
    <TexturedSafeAreaView style={styles.page}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh(actor)} />
        }
      >
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.back}>← Назад</Text>
        </Pressable>
        <Text style={styles.heading}>Прогулки</Text>
        <Text style={styles.subtitle}>История прогулок с собакой</Text>
        <Pressable
          style={styles.startButton}
          onPress={() => router.push("/(main)/walk" as Href)}
          accessibilityRole="button"
          accessibilityLabel="Открыть таймер прогулки"
        >
          <Text style={styles.startButtonText}>🐕 Таймер прогулки</Text>
        </Pressable>
        {syncWarning ? (
          <Text style={styles.warning}>
            Нет связи с сервером. Показываем данные телефона; синхронизация повторится позже.
          </Text>
        ) : null}
        {!journal && refreshing ? <Text style={styles.subtitle}>Загружаем историю…</Text> : null}
        {journal && rows.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.subtitle}>Завершённых прогулок пока нет.</Text>
          </View>
        ) : null}
        {rows.map((row) => (
          <View key={row.id} style={styles.card}>
            <Text style={styles.date}>{row.day}</Text>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Вышли</Text>
              <Text style={styles.value}>{row.departedAt}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Гуляли</Text>
              <Text style={styles.value}>{row.duration}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Вернулись</Text>
              <Text style={styles.value}>{row.returnedAt}</Text>
            </View>
          </View>
        ))}
        <Text style={styles.note}>
          Сохранено на телефоне и синхронизируется с сервером. При расхождениях приоритет у
          телефона.
        </Text>
      </ScrollView>
    </TexturedSafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg, gap: 14, paddingBottom: 48 },
  heading: { fontSize: 27, fontWeight: "700", color: COLORS.text },
  subtitle: { fontSize: 14, color: COLORS.textSecondary },
  back: { fontSize: 15, color: COLORS.primary },
  startButton: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: "center",
  },
  startButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  card: { borderRadius: 18, padding: 18, gap: 9, backgroundColor: COLORS.cardBackground },
  date: { fontSize: 17, fontWeight: "700", color: COLORS.text, marginBottom: 4 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", gap: 16 },
  label: { color: COLORS.textSecondary, fontSize: 14 },
  value: { color: COLORS.text, fontSize: 15, fontWeight: "600" },
  warning: { color: "#8F5D20", fontSize: 13 },
  note: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18 },
});
