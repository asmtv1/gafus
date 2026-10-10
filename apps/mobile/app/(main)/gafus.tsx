import { useCallback, useState } from "react";
import { ScrollView, View, Text, Pressable, StyleSheet, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { TexturedSafeAreaView } from "@/shared/components";
import { Loading } from "@/shared/components/ui";
import { COLORS, SPACING } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { gafusApi } from "@/shared/lib/api/gafus";
import type { GafusHistoryEntry } from "@gafus/types";

const TITLES: Record<string, string> = {
  POST_PUBLISHED: "Публикация",
  QUESTION_CREATED: "Новый вопрос",
  ANSWER_CREATED: "Ответ в сообществе",
  POST_REACTION_MILESTONE: "Реакции на публикацию",
  BEST_ANSWER: "Лучший ответ",
  SPEND: "Открытие обучения",
  ADMIN_CREDIT: "Начисление администратором",
  ADMIN_DEBIT: "Корректировка администратором",
  LEGACY_IMPORT: "Перенос Гафусов",
};
const nameOf = (item: GafusHistoryEntry) =>
  TITLES[item.rewardKind ?? item.kind] ?? "Операция";

export default function GafusScreen() {
  const router = useRouter();
  const userId = useAuthStore(s => s.user?.id);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [items, setItems] = useState<GafusHistoryEntry[]>([]);
  const [moreLoading, setMoreLoading] = useState(false);
  const status = useQuery({
    queryKey: ["gafus-status", userId],
    queryFn: () => gafusApi.status(),
    enabled: Boolean(userId),
    staleTime: 15_000,
  });
  const history = useQuery({
    queryKey: ["gafus-history", userId],
    queryFn: () => gafusApi.history(),
    enabled: Boolean(userId),
  });
  const refresh = useCallback(async () => {
    setItems([]);
    setCursor(undefined);
    await Promise.all([status.refetch(), history.refetch()]);
  }, [status, history]);
  const loadMore = useCallback(async () => {
    const next = cursor === undefined ? history.data?.nextCursor : cursor;
    if (!next || moreLoading) return;
    setMoreLoading(true);
    try {
      const page = await gafusApi.history(next);
      setItems(previous => [...previous, ...page.items]);
      setCursor(page.nextCursor);
    } finally {
      setMoreLoading(false);
    }
  }, [cursor, history.data?.nextCursor, moreLoading]);

  if (status.isPending || history.isPending) return <Loading fullScreen message="Загружаем Гафусы" />;
  if (status.isError || history.isError || !status.data || !history.data) {
    return <TexturedSafeAreaView style={styles.screen} edges={[]}>
      <View style={styles.error}><Text style={styles.errorText}>Не удалось загрузить Гафусы</Text>
        <Pressable style={styles.button} onPress={() => void refresh()} accessibilityRole="button">
          <Text style={styles.buttonText}>Повторить</Text>
        </Pressable>
      </View>
    </TexturedSafeAreaView>;
  }
  const data = status.data;
  const allItems = [...history.data.items, ...items];
  const canMore = cursor === undefined ? history.data.nextCursor !== null : cursor !== null;
  return <TexturedSafeAreaView style={styles.screen} edges={[]}>
    <ScrollView contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={status.isRefetching || history.isRefetching} onRefresh={() => void refresh()} />}>
      <View style={styles.balanceCard}>
        <View style={styles.balanceTitle}><MaterialCommunityIcons name="paw" size={27} color="#738453" />
          <Text style={styles.balanceHeading}>Мои Гафусы</Text></View>
        <Text style={styles.balanceValue} accessibilityLabel={`Баланс: ${data.wallet.balance} Гафусов`}>{data.wallet.balance}</Text>
        <Text style={styles.subText}>Баланс внутренней валюты</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>Зарабатывайте за активность</Text>
        <Text style={styles.description}>Публикуйте посты, задавайте вопросы и помогайте другим. За 24 часа можно получить до {data.activity.limit} Гафусов.</Text>
        <Text style={styles.highlight}>Осталось получить: {data.activity.remaining}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>Открывайте обучение</Text>
        <Text style={styles.description}>Шаг курса — {data.rules.courseStepCost} Гафус, мини-гайд — {data.rules.miniGuideCost}. Доступ на {Math.round(data.rules.accessDurationSeconds / 86400)} дней.</Text>
      </View>
      <Pressable style={styles.button} onPress={() => router.push("/(main)/gafus-guides" as Href)}>
        <Text style={styles.buttonText}>Смотреть мини-гайды →</Text>
      </Pressable>
      {!data.enabled.economy && <Text style={styles.note}>Система мотивации пока не включена.</Text>}
      <View style={styles.historyCard}>
        <Text style={styles.title}>История операций</Text>
        {allItems.length ? allItems.map(item =>
          <View style={styles.row} key={item.id}>
            <View style={styles.rowBody}><Text style={styles.rowTitle}>{nameOf(item)}</Text>
              <Text style={styles.date}>{new Date(item.createdAt).toLocaleString("ru-RU")}</Text></View>
            <Text style={[styles.delta, { color: item.delta >= 0 ? "#60763A" : "#AD6E38" }]}>
              {item.delta > 0 ? "+" : ""}{item.delta}
            </Text>
          </View>
        ) : <Text style={styles.description}>Пока нет операций. Первый Гафус ещё впереди!</Text>}
        {canMore && <Pressable disabled={moreLoading} style={styles.button} onPress={() => void loadMore()}>
          <Text style={styles.buttonText}>{moreLoading ? "Загрузка…" : "Показать ещё"}</Text>
        </Pressable>}
      </View>
    </ScrollView>
  </TexturedSafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.md, paddingBottom: 44, gap: 12 },
  balanceCard: { backgroundColor: "#FFF3D1", borderColor: "#EED9A4", borderWidth: 1, borderRadius: 20, padding: 23, alignItems: "center", gap: 6 },
  balanceTitle: { flexDirection: "row", alignItems: "center", gap: 10 },
  balanceHeading: { fontSize: 22, fontWeight: "700", color: COLORS.text },
  balanceValue: { fontSize: 44, fontWeight: "800", color: "#444A30" },
  subText: { color: "#72785E", fontSize: 13 },
  card: { backgroundColor: "#FFFDF7", borderRadius: 18, borderWidth: 1, borderColor: "#E8E5D8", padding: 19, gap: 8 },
  historyCard: { backgroundColor: "#FFFDF7", borderRadius: 18, borderWidth: 1, borderColor: "#E8E5D8", padding: 19, gap: 12 },
  title: { fontSize: 18, fontWeight: "700", color: COLORS.text },
  description: { color: "#666E5D", lineHeight: 21, fontSize: 14 },
  highlight: { color: "#60763A", fontWeight: "700", marginTop: 3 },
  note: { padding: 13, color: "#695A39", backgroundColor: "#FDF0D8", borderRadius: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#ECEADD" },
  rowBody: { flex: 1, gap: 4 },
  rowTitle: { color: COLORS.text, fontWeight: "600", fontSize: 14 },
  date: { color: "#81877C", fontSize: 12 },
  delta: { fontSize: 18, fontWeight: "800" },
  button: { alignSelf: "flex-start", backgroundColor: "#738453", borderRadius: 12, paddingHorizontal: 17, paddingVertical: 12, marginTop: 6 },
  buttonText: { color: "#FFF", fontWeight: "700" },
  error: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  errorText: { fontSize: 17, color: COLORS.text },
});
