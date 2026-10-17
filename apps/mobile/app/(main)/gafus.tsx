import { useCallback, useState, type ReactNode } from "react";
import { ScrollView, View, Text, Pressable, StyleSheet, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppBackButton, TexturedSafeAreaView } from "@/shared/components";
import { Loading } from "@/shared/components/ui";
import { GafusWalletOverview } from "@/features/gafus/GafusWalletOverview";
import { COLORS, FONTS } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { gafusApi } from "@/shared/lib/api/gafus";
import type { GafusHistoryEntry } from "@gafus/types";

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

  if (status.isPending || history.isPending) {
    return (
      <GafusPage>
        <Loading fullScreen embedded message="Загружаем Гафусы" />
      </GafusPage>
    );
  }
  if (status.isError || history.isError || !status.data || !history.data) {
    return <GafusPage>
      <View style={styles.error}><Text style={styles.errorText}>Не удалось загрузить Гафусы</Text>
        <Pressable style={styles.button} onPress={() => void refresh()} accessibilityRole="button">
          <Text style={styles.buttonText}>Повторить</Text>
        </Pressable>
      </View>
    </GafusPage>;
  }
  const data = status.data;
  const allItems = [...history.data.items, ...items];
  const canMore = cursor === undefined ? history.data.nextCursor !== null : cursor !== null;
  return <GafusPage>
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={status.isRefetching || history.isRefetching}
          onRefresh={() => void refresh()}
        />
      }
    >
      <GafusWalletOverview
        data={data}
        history={allItems}
        canLoadMore={canMore}
        loadingMore={moreLoading}
        onLoadMore={() => void loadMore()}
      />
    </ScrollView>
  </GafusPage>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
    minHeight: 56,
  },
  pageTitle: {
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FONTS.montserratMedium,
    color: COLORS.text,
  },
  content: { paddingHorizontal: 12, paddingTop: 2, paddingBottom: 36 },
  button: { alignSelf: "flex-start", backgroundColor: "#738453", borderRadius: 12, paddingHorizontal: 17, paddingVertical: 12, marginTop: 6 },
  buttonText: { color: "#FFF", fontWeight: "700" },
  error: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  errorText: { fontSize: 17, color: COLORS.text },
});
