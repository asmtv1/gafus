import { useCallback, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { Button, Text, TextInput } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatConsultationConfirmSlotMsk } from "@gafus/core/services/consultation/consultationMskFormat";
import type { Href } from "expo-router";
import { useLocalSearchParams, useRouter } from "expo-router";

import { COLORS, FONTS, SPACING } from "@/constants";
import { consultationsApi } from "@/shared/lib/api";
import { reportClientError } from "@/shared/lib/tracer";
import { hapticFeedback } from "@/shared/lib/utils/haptics";

function one(param: string | string[] | undefined): string {
  return Array.isArray(param) ? (param[0] ?? "") : (param ?? "");
}

/**
 * Подтверждение записи с кратким описанием проблемы — как web ConsultationBookingConfirmClient.
 */
export default function ConsultationBookingConfirmScreen() {
  const params = useLocalSearchParams<{
    cynologistUserId?: string | string[];
    slotId?: string | string[];
    startAtUtc?: string | string[];
    endAtUtc?: string | string[];
    cynologistName?: string | string[];
  }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [clientProblem, setClientProblem] = useState("");
  const [idemKey] = useState(() =>
    typeof globalThis.crypto !== "undefined" && globalThis.crypto.randomUUID
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`,
  );

  const cynologistUserId = one(params.cynologistUserId);
  const slotId = one(params.slotId);
  const startAtUtc = one(params.startAtUtc);
  const endAtUtc = one(params.endAtUtc);
  const cynologistName = one(params.cynologistName);

  const slotLabel = useMemo(
    () => formatConsultationConfirmSlotMsk(startAtUtc, endAtUtc),
    [startAtUtc, endAtUtc],
  );

  const bookMutation = useMutation({
    mutationFn: async () => {
      const verified = await consultationsApi.verifySlotFree(cynologistUserId, slotId);
      if (!verified.success) {
        const code = verified.code ?? "VERIFY_FAILED";
        throw Object.assign(new Error(verified.error ?? code), { code });
      }
      const res = await consultationsApi.book(slotId, idemKey, clientProblem);
      if (!res.success) {
        const code = res.code ?? "BOOK_FAILED";
        throw Object.assign(new Error(res.error ?? code), { code });
      }
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["consultations"] });
      hapticFeedback.medium();
      router.replace("/consultations/mine" as Href);
    },
    onError: (e: unknown) => {
      const code = typeof e === "object" && e && "code" in e ? String((e as { code?: string }).code) : "";
      const msg = e instanceof Error ? e.message : String(e);
      if (
        code === "CONSULTATION_SLOT_TAKEN" ||
        code === "CONSULTATION_NOT_FOUND" ||
        msg.includes("CONSULTATION_SLOT_TAKEN") ||
        msg.toLowerCase().includes("занят")
      ) {
        Alert.alert(
          "Слот занят",
          "Извините, этот слот уже занят. Выберите другое время.",
          [
            {
              text: "OK",
              onPress: () => router.replace(`/consultations/${cynologistUserId}` as Href),
            },
          ],
        );
        return;
      }
      reportClientError(e instanceof Error ? e : new Error(String(e)), {
        issueKey: "consultation",
        keys: { screen: "booking-confirm" },
      });
      Alert.alert("Ошибка", "Не удалось забронировать.");
    },
  });

  const onSubmit = useCallback(() => {
    if (!slotId || !cynologistUserId) {
      Alert.alert("Ошибка", "Не хватает данных для записи.");
      return;
    }
    hapticFeedback.light();
    bookMutation.mutate();
  }, [bookMutation, cynologistUserId, slotId]);

  if (!cynologistUserId || !slotId) {
    return (
      <SafeAreaView style={styles.root} edges={["bottom"]}>
        <Text style={styles.error}>Не указаны параметры записи.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.lead}>Проверьте детали перед финальным бронированием.</Text>

        <View style={styles.metaBlock}>
          <Text style={styles.metaRow}>
            <Text style={styles.metaLabel}>Кинолог: </Text>
            {cynologistName.trim() ? cynologistName : "Кинолог"}
          </Text>
          <Text style={styles.metaRow}>
            <Text style={styles.metaLabel}>Слот: </Text>
            {slotLabel}
          </Text>
          <Text style={styles.metaHint}>Все времена рассчитываются по МСК (UTC+3).</Text>
        </View>

        <TextInput
          mode="outlined"
          label="Краткое изложение проблемы (для кинолога)"
          multiline
          numberOfLines={5}
          value={clientProblem}
          onChangeText={setClientProblem}
          placeholder="Опишите, что беспокоит, как давно это происходит, что уже пробовали."
          style={styles.input}
        />

        <Text style={styles.notice}>
          После нажатия «Забронировать» вам на почту придёт ссылка на Телемост. В назначенное время
          подключитесь по этой ссылке — кинолог будет ждать вас там.
        </Text>
        <Text style={styles.notice}>
          Если письмо со ссылкой не пришло, проверьте папку «Спам» или напишите в поддержку.
        </Text>

        <View style={styles.actions}>
          <Button
            mode="outlined"
            onPress={() => router.replace(`/consultations/${cynologistUserId}` as Href)}
            disabled={bookMutation.isPending}
          >
            Назад к слотам
          </Button>
          <Button mode="contained" onPress={onSubmit} loading={bookMutation.isPending}>
            Забронировать
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: SPACING.md, paddingBottom: SPACING.xl, gap: SPACING.md },
  lead: { fontFamily: FONTS.montserrat, fontSize: 14, color: COLORS.textSecondary },
  metaBlock: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    gap: SPACING.xs,
  },
  metaRow: { fontFamily: FONTS.montserrat, fontSize: 14, color: COLORS.text },
  metaLabel: { fontFamily: FONTS.montserratMedium, color: COLORS.text },
  metaHint: { fontFamily: FONTS.montserrat, fontSize: 12, color: COLORS.textSecondary, marginTop: SPACING.xs },
  input: { backgroundColor: COLORS.surface, minHeight: 120 },
  notice: { fontFamily: FONTS.montserrat, fontSize: 13, color: COLORS.textSecondary, lineHeight: 20 },
  actions: { flexDirection: "column", gap: SPACING.sm, marginTop: SPACING.md },
  error: { color: COLORS.error, padding: SPACING.md, fontFamily: FONTS.montserrat },
});
