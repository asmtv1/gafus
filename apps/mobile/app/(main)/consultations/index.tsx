import { useCallback, useEffect, useMemo } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { COLORS, FONTS, SPACING } from "@/constants";
import { consultationsApi } from "@/shared/lib/api";
import { reportClientError } from "@/shared/lib/tracer";
import { hapticFeedback } from "@/shared/lib/utils/haptics";

/**
 * Список кинологов, доступных для записи на консультацию.
 */
export default function ConsultationsListScreen() {
  const router = useRouter();
  const query = useQuery({
    queryKey: ["consultations", "cynologists"],
    queryFn: async () => {
      const res = await consultationsApi.listCynologists();
      if (!res.success) {
        throw new Error(res.error ?? "Ошибка загрузки");
      }
      return res.data ?? [];
    },
  });

  const items = useMemo(() => query.data ?? [], [query.data]);

  useEffect(() => {
    if (query.isError && query.error) {
      reportClientError(
        query.error instanceof Error ? query.error : new Error(String(query.error)),
        { issueKey: "consultation", keys: { screen: "list" } },
      );
    }
  }, [query.isError, query.error]);

  const onOpen = useCallback(
    (userId: string) => {
      hapticFeedback.medium();
      router.push(`/consultations/${userId}` as Href);
    },
    [router],
  );

  const onMine = useCallback(() => {
    hapticFeedback.light();
    router.push("/consultations/mine" as Href);
  }, [router]);

  return (
    <SafeAreaView style={styles.root} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Pressable style={styles.mineRow} onPress={onMine}>
            <MaterialCommunityIcons name="calendar-account" size={22} color={COLORS.primary} />
            <Text style={styles.mineText}>Мои записи</Text>
            <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.textSecondary} />
          </Pressable>
          {query.isError ? (
            <Text style={styles.error}>Не удалось загрузить список. Попробуйте позже.</Text>
          ) : null}
          {query.isLoading ? <Text style={styles.muted}>Загрузка…</Text> : null}
          {!query.isLoading && items.length === 0 ? (
            <Text style={styles.muted}>Пока нет доступных кинологов.</Text>
          ) : null}
          {items.map((c) => (
            <Pressable
              key={c.id}
              style={styles.card}
              onPress={() => onOpen(c.userId)}
            >
              <Text style={styles.title}>{c.displayName ?? "Кинолог"}</Text>
              <Text style={styles.sub}>
                Слот {c.slotDurationMin} мин. · МСК (UTC+3)
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: SPACING.md, paddingBottom: SPACING.xl },
  mineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    marginBottom: SPACING.md,
  },
  mineText: { flex: 1, fontFamily: FONTS.montserratMedium, fontSize: 16, color: COLORS.text },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  title: { fontFamily: FONTS.montserratMedium, fontSize: 16, color: COLORS.text },
  sub: { fontFamily: FONTS.montserrat, fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },
  muted: { fontFamily: FONTS.montserrat, fontSize: 14, color: COLORS.textSecondary },
  error: { color: COLORS.error, marginBottom: SPACING.md },
});
