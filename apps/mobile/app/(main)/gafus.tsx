import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, View, Text, Pressable, StyleSheet, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { AppBackButton, TexturedSafeAreaView } from "@/shared/components";
import { Loading } from "@/shared/components/ui";
import { COLORS, SPACING } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { reportClientError } from "@/shared/lib/tracer";
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
const nameOf = (item: GafusHistoryEntry) => TITLES[item.rewardKind ?? item.kind] ?? "Операция";

/** Keep the sky texture continuous beneath the status bar and the page header. */
function GafusPage({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <TexturedSafeAreaView style={styles.screen} edges={["top"]}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      <View style={styles.pageHeader}>
        <AppBackButton onPress={() => router.back()} />
        <Text style={styles.pageTitle}>Мои Гафусы</Text>
      </View>
      {children}
    </TexturedSafeAreaView>
  );
}

export default function GafusScreen() {
  const owner = useAuthStore((s) =>
    s.isAuthenticated && !s.isLoading ? (s.user?.id ?? null) : null,
  );
  const authed = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const verified = newOnlyV2NativeQueues.getVerifiedBinding();
  const epoch = owner && verified?.principalId === owner ? verified.authEpoch : null;
  if (authLoading || (authed && (!owner || !epoch)))
    return (
      <GafusPage>
        <Loading fullScreen embedded message="Загружаем Гафусы" />
      </GafusPage>
    );
  if (!owner || !epoch)
    return (
      <GafusPage>
        <Text style={styles.description}>Для просмотра Гафусов войдите в аккаунт.</Text>
      </GafusPage>
    );
  return <ActorGafus key={`${owner}:${epoch}`} owner={owner} epoch={epoch} />;
}

function ActorGafus({ owner, epoch }: { owner: string; epoch: string }) {
  const router = useRouter();
  const mounted = useRef(true);
  const moreInFlight = useRef(false);
  const refreshInFlight = useRef(false);
  const seenCursors = useRef(new Set<string>());
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [items, setItems] = useState<GafusHistoryEntry[]>([]);
  const [moreLoading, setMoreLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const current = useCallback(() => {
    const state = useAuthStore.getState();
    const binding = newOnlyV2NativeQueues.getVerifiedBinding();
    return (
      mounted.current &&
      state.isAuthenticated &&
      !state.isLoading &&
      state.user?.id === owner &&
      binding?.principalId === owner &&
      binding.authEpoch === epoch
    );
  }, [owner, epoch]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const status = useQuery({
    queryKey: ["gafus-status", owner, epoch],
    queryFn: () => gafusApi.status(),
    staleTime: 15_000,
  });
  const history = useQuery({
    queryKey: ["gafus-history", owner, epoch],
    queryFn: () => gafusApi.history(),
  });

  const refresh = async () => {
    if (!current() || refreshInFlight.current || moreInFlight.current) return;
    refreshInFlight.current = true;
    setNotice("");
    try {
      const refreshed = await Promise.allSettled([
        Promise.resolve().then(() => status.refetch()),
        Promise.resolve().then(() => history.refetch()),
      ]);
      if (!current()) return;
      const successful = refreshed.every(
        (outcome) => outcome.status === "fulfilled" && !outcome.value.isError,
      );
      if (!successful) {
        reportClientError(new Error("GAFUS_WALLET_REFRESH_FAILED"), {
          issueKey: "GafusWallet",
          keys: { operation: "refresh" },
        });
        setNotice("Не удалось обновить Гафусы. Попробуйте ещё раз.");
        return;
      }
      seenCursors.current.clear();
      setItems([]);
      setCursor(undefined);
    } finally {
      refreshInFlight.current = false;
    }
  };
  const loadMore = async () => {
    if (
      !current() ||
      moreInFlight.current ||
      refreshInFlight.current ||
      !history.data ||
      history.isError
    )
      return;
    const next = cursor === undefined ? history.data.nextCursor : cursor;
    if (!next || seenCursors.current.has(next)) return;
    moreInFlight.current = true;
    seenCursors.current.add(next);
    setMoreLoading(true);
    setNotice("");
    let acknowledged = false;
    try {
      const page = await gafusApi.history(next);
      if (!current()) return;
      if (
        !page ||
        !Array.isArray(page.items) ||
        !(typeof page.nextCursor === "string" || page.nextCursor === null)
      ) {
        throw new Error("INVALID_GAFUS_HISTORY_PAGE");
      }
      acknowledged = true;
      setItems((previous) => {
        const base = history.data?.items ?? [];
        const existingIds = new Set([...base, ...previous].map((entry) => entry.id));
        return [...previous, ...page.items.filter((entry) => !existingIds.has(entry.id))];
      });
      setCursor(page.nextCursor === next ? null : page.nextCursor);
    } catch {
      if (current()) {
        reportClientError(new Error("GAFUS_WALLET_NEXT_PAGE_FAILED"), {
          issueKey: "GafusWallet",
          keys: { operation: "next_page" },
        });
        setNotice("Не удалось загрузить следующие операции. Попробуйте ещё раз.");
      }
    } finally {
      if (!acknowledged) seenCursors.current.delete(next);
      moreInFlight.current = false;
      if (current()) setMoreLoading(false);
    }
  };

  if (status.isPending || history.isPending)
    return (
      <GafusPage>
        <Loading fullScreen embedded message="Загружаем Гафусы" />
      </GafusPage>
    );
  if (status.isError || history.isError || !status.data || !history.data)
    return (
      <GafusPage>
        <View style={styles.error}>
          <Text style={styles.errorText}>Не удалось загрузить Гафусы</Text>
          <Pressable
            style={styles.button}
            accessibilityRole="button"
            accessibilityLabel="Повторить загрузку Гафусов"
            onPress={() => void refresh()}
          >
            <Text style={styles.buttonText}>Повторить</Text>
          </Pressable>
        </View>
      </GafusPage>
    );
  const data = status.data;
  const allItems = [...history.data.items, ...items];
  const nextCursor = cursor === undefined ? history.data.nextCursor : cursor;
  const canMore = Boolean(nextCursor && !seenCursors.current.has(nextCursor));
  return (
    <GafusPage>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={status.isRefetching || history.isRefetching}
            onRefresh={() => void refresh()}
          />
        }
      >
        <View style={styles.balanceCard}>
          <View style={styles.balanceTitle}>
            <MaterialCommunityIcons name="paw" size={27} color="#738453" />
            <Text style={styles.balanceHeading}>Мои Гафусы</Text>
          </View>
          <Text
            style={styles.balanceValue}
            accessibilityLabel={`Баланс: ${data.wallet.balance} Гафусов`}
          >
            {data.wallet.balance}
          </Text>
          <Text style={styles.subText}>Баланс внутренней валюты</Text>
        </View>
        {!!notice && (
          <Text accessibilityRole="alert" style={styles.errorText}>
            {notice}
          </Text>
        )}
        <View style={styles.card}>
          <Text style={styles.title}>Зарабатывайте за активность</Text>
          <Text style={styles.description}>
            Публикуйте посты, задавайте вопросы и помогайте другим. За 24 часа можно получить до{" "}
            {data.activity.limit} Гафусов.
          </Text>
          <Text style={styles.highlight}>Осталось получить: {data.activity.remaining}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.title}>Открывайте обучение</Text>
          <Text style={styles.description}>
            Шаг курса — {data.rules.courseStepCost} Гафус, мини-гайд — {data.rules.miniGuideCost}.
            Доступ на {Math.round(data.rules.accessDurationSeconds / 86400)} дней.
          </Text>
        </View>
        {data.enabled.economy && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Смотреть мини-гайды"
            style={styles.button}
            onPress={() => {
              if (current()) router.push("/(main)/gafus-guides" as Href);
            }}
          >
            <Text style={styles.buttonText}>Смотреть мини-гайды →</Text>
          </Pressable>
        )}
        {!data.enabled.economy && (
          <Text style={styles.note}>Система мотивации пока не включена.</Text>
        )}
        <View style={styles.historyCard}>
          <Text style={styles.title}>История операций</Text>
          {allItems.length ? (
            allItems.map((item) => (
              <View style={styles.row} key={item.id}>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>{nameOf(item)}</Text>
                  <Text style={styles.date}>
                    {new Date(item.createdAt).toLocaleString("ru-RU")}
                  </Text>
                </View>
                <Text style={[styles.delta, { color: item.delta >= 0 ? "#60763A" : "#AD6E38" }]}>
                  {item.delta > 0 ? "+" : ""}
                  {item.delta}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.description}>Пока нет операций. Первый Гафус ещё впереди!</Text>
          )}
          {canMore && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Показать ещё операции"
              disabled={moreLoading}
              style={styles.button}
              onPress={() => void loadMore()}
            >
              <Text style={styles.buttonText}>{moreLoading ? "Загрузка…" : "Показать ещё"}</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </GafusPage>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    minHeight: 68,
  },
  pageTitle: {
    flexShrink: 1,
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.text,
  },
  content: { padding: SPACING.md, paddingBottom: 44, gap: 12 },
  balanceCard: {
    backgroundColor: "#FFF3D1",
    borderColor: "#EED9A4",
    borderWidth: 1,
    borderRadius: 20,
    padding: 23,
    alignItems: "center",
    gap: 6,
  },
  balanceTitle: { flexDirection: "row", alignItems: "center", gap: 10 },
  balanceHeading: { fontSize: 22, fontWeight: "700", color: COLORS.text },
  balanceValue: { fontSize: 44, fontWeight: "800", color: "#444A30" },
  subText: { color: "#72785E", fontSize: 13 },
  card: {
    backgroundColor: "#FFFDF7",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8E5D8",
    padding: 19,
    gap: 8,
  },
  historyCard: {
    backgroundColor: "#FFFDF7",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8E5D8",
    padding: 19,
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: "700", color: COLORS.text },
  description: { color: "#666E5D", lineHeight: 21, fontSize: 14 },
  highlight: { color: "#60763A", fontWeight: "700", marginTop: 3 },
  note: { padding: 13, color: "#695A39", backgroundColor: "#FDF0D8", borderRadius: 12 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ECEADD",
  },
  rowBody: { flex: 1, gap: 4 },
  rowTitle: { color: COLORS.text, fontWeight: "600", fontSize: 14 },
  date: { color: "#81877C", fontSize: 12 },
  delta: { fontSize: 18, fontWeight: "800" },
  button: {
    alignSelf: "flex-start",
    backgroundColor: "#738453",
    borderRadius: 12,
    paddingHorizontal: 17,
    paddingVertical: 12,
    marginTop: 6,
  },
  buttonText: { color: "#FFF", fontWeight: "700" },
  error: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  errorText: { fontSize: 17, color: COLORS.text },
});
