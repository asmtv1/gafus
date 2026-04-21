import { useCallback, useMemo, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Text, Snackbar } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Href } from "expo-router";
import { useLocalSearchParams, useRouter } from "expo-router";

import { COLORS, FONTS, SPACING } from "@/constants";
import { consultationsApi } from "@/shared/lib/api";
import { reportClientError } from "@/shared/lib/tracer";
import { hapticFeedback } from "@/shared/lib/utils/haptics";

/**
 * Свободные слоты и бронирование у выбранного кинолога.
 */
export default function ConsultationSlotsScreen() {
  const params = useLocalSearchParams<{ userId: string | string[] }>();
  const userId = Array.isArray(params.userId) ? params.userId[0] : params.userId;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [snack, setSnack] = useState<string | null>(null);
  const [pendingSlot, setPendingSlot] = useState<string | null>(null);
  const [idemKeys, setIdemKeys] = useState<Record<string, string>>({});

  const { fromIso, toIso } = useMemo(() => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 14);
    return { fromIso: from.toISOString(), toIso: to.toISOString() };
  }, []);

  const slotsQuery = useQuery({
    queryKey: ["consultations", "slots", userId, fromIso, toIso],
    enabled: Boolean(userId && userId.length > 0),
    queryFn: async () => {
      const res = await consultationsApi.getSlots(userId!, fromIso, toIso);
      if (!res.success) {
        throw new Error(res.error ?? "Ошибка");
      }
      return res.data ?? [];
    },
  });

  const bookMutation = useMutation({
    mutationFn: async (slotId: string) => {
      let key = idemKeys[slotId];
      if (!key) {
        key =
          typeof globalThis.crypto !== "undefined" && globalThis.crypto.randomUUID
            ? globalThis.crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`;
        setIdemKeys((prev) => ({ ...prev, [slotId]: key }));
      }
      const res = await consultationsApi.book(slotId, key);
      if (!res.success) {
        throw new Error(res.error ?? "Ошибка бронирования");
      }
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["consultations", "cynologists"] });
      await queryClient.invalidateQueries({ queryKey: ["consultations", "mine"] });
      setSnack("Запись создана");
      setTimeout(() => router.replace("/consultations/mine" as Href), 600);
    },
    onError: (e: unknown) => {
      reportClientError(e instanceof Error ? e : new Error(String(e)), {
        issueKey: "consultation",
        keys: { screen: "slots", userId: userId ?? "" },
      });
      setSnack("Не удалось записаться");
    },
    onSettled: () => setPendingSlot(null),
  });

  const onBook = useCallback(
    (slotId: string) => {
      hapticFeedback.medium();
      setPendingSlot(slotId);
      bookMutation.mutate(slotId);
    },
    [bookMutation],
  );

  const slots = slotsQuery.data ?? [];

  if (!userId) {
    return (
      <SafeAreaView style={styles.root} edges={["bottom"]}>
        <Text style={styles.error}>Не указан кинолог.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {slotsQuery.isLoading ? (
            <ActivityIndicator color={COLORS.primary} />
          ) : null}
          {slotsQuery.isError ? (
            <Text style={styles.error}>Не удалось загрузить слоты.</Text>
          ) : null}
          {slots.length === 0 && !slotsQuery.isLoading ? (
            <Text style={styles.muted}>Нет свободных слотов на ближайшие 14 дней.</Text>
          ) : null}
          {slots.map((s) => (
            <View key={s.id} style={styles.row}>
              <Text style={styles.slotText}>
                {new Date(s.startAtUtc).toLocaleString("ru-RU")} —{" "}
                {new Date(s.endAtUtc).toLocaleTimeString("ru-RU", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
              <Pressable
                style={styles.btn}
                disabled={pendingSlot === s.id}
                onPress={() => onBook(s.id)}
              >
                <Text style={styles.btnText}>{pendingSlot === s.id ? "…" : "Записаться"}</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
        <Snackbar visible={Boolean(snack)} onDismiss={() => setSnack(null)} duration={2000}>
          {snack}
        </Snackbar>
      </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: SPACING.md, paddingBottom: SPACING.xl },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    gap: SPACING.sm,
  },
  slotText: { flex: 1, fontFamily: FONTS.montserrat, fontSize: 14, color: COLORS.text },
  btn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 8,
  },
  btnText: { color: "#fff", fontFamily: FONTS.montserratMedium, fontSize: 14 },
  muted: { fontFamily: FONTS.montserrat, fontSize: 14, color: COLORS.textSecondary },
  error: { color: COLORS.error, marginBottom: SPACING.md },
});
