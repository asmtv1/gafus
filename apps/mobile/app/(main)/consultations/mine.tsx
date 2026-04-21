import { useCallback, useMemo } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";

import { COLORS, FONTS, SPACING } from "@/constants";
import { consultationsApi } from "@/shared/lib/api";
import { reportClientError } from "@/shared/lib/tracer";
import { hapticFeedback } from "@/shared/lib/utils/haptics";

/**
 * Список моих бронирований консультаций.
 */
export default function ConsultationsMineScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["consultations", "mine"],
    queryFn: async () => {
      const res = await consultationsApi.myBookings();
      if (!res.success) {
        throw new Error(res.error ?? "Ошибка");
      }
      return res.data ?? { items: [], nextCursor: null };
    },
  });

  const items = useMemo(() => query.data?.items ?? [], [query.data]);

  const cancelMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await consultationsApi.cancelBooking(bookingId);
      if (!res.success) {
        throw new Error(res.error ?? "Ошибка отмены");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["consultations", "mine"] });
    },
    onError: (e: unknown) => {
      reportClientError(e instanceof Error ? e : new Error(String(e)), {
        issueKey: "consultation",
        keys: { screen: "mine" },
      });
    },
  });

  const canCancel = useCallback((status: string) => {
    return status === "PENDING_TRAINER_CONFIRMATION" || status === "CONFIRMED";
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Pressable
            style={styles.linkRow}
            onPress={() => {
              hapticFeedback.light();
              router.push("/consultations" as Href);
            }}
          >
            <Text style={styles.linkText}>← К списку кинологов</Text>
          </Pressable>
          {query.isLoading ? <Text style={styles.muted}>Загрузка…</Text> : null}
          {query.isError ? (
            <Text style={styles.error}>Не удалось загрузить записи.</Text>
          ) : null}
          {items.length === 0 && !query.isLoading ? (
            <Text style={styles.muted}>Пока нет записей.</Text>
          ) : null}
          {items.map((b) => (
            <View key={b.id} style={styles.card}>
              <Text style={styles.status}>{b.status}</Text>
              <Text style={styles.title}>
                {b.cynologistDisplayName ?? "Кинолог"} —{" "}
                {new Date(b.slot.startAtUtc).toLocaleString("ru-RU")}
              </Text>
              {b.status === "CONFIRMED" && b.joinUrl ? (
                <Pressable
                  onPress={() => {
                    void Linking.openURL(b.joinUrl!);
                  }}
                >
                  <Text style={styles.link}>Открыть ссылку на встречу</Text>
                </Pressable>
              ) : null}
              {canCancel(b.status) ? (
                <Pressable
                  style={styles.cancelBtn}
                  disabled={cancelMutation.isPending}
                  onPress={() => {
                    hapticFeedback.medium();
                    cancelMutation.mutate(b.id);
                  }}
                >
                  <Text style={styles.cancelText}>Отменить</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: SPACING.md, paddingBottom: SPACING.xl },
  linkRow: { marginBottom: SPACING.md },
  linkText: { fontFamily: FONTS.montserratMedium, fontSize: 14, color: COLORS.primary },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  status: { fontFamily: FONTS.montserrat, fontSize: 12, color: COLORS.textSecondary },
  title: { fontFamily: FONTS.montserratMedium, fontSize: 15, color: COLORS.text, marginTop: 4 },
  link: { marginTop: SPACING.sm, color: COLORS.primary, fontFamily: FONTS.montserratMedium, fontSize: 14 },
  cancelBtn: { alignSelf: "flex-start", marginTop: SPACING.sm },
  cancelText: { color: COLORS.error, fontFamily: FONTS.montserratMedium, fontSize: 14 },
  muted: { fontFamily: FONTS.montserrat, fontSize: 14, color: COLORS.textSecondary },
  error: { color: COLORS.error, marginBottom: SPACING.md },
});
