import { memo, useCallback, useRef, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { Button, Loading } from "@/shared/components/ui";
import { COLORS, SPACING } from "@/shared/config";
import { gafusApi } from "@/shared/lib/api/gafus";
import { useAuthStore } from "@/shared/stores";
import { reportClientError } from "@/shared/lib/tracer";
import { trackEvent } from "@/shared/lib/analytics";

type Props = {
  dayOnCourseId: string;
  stepOnDayId: string;
  onUnlocked: () => Promise<unknown>;
};

/** Additional unlock method; existing ads and subscription remain available. */
export const GafusStepUnlock = memo(function GafusStepUnlock({
  dayOnCourseId, stepOnDayId, onUnlocked,
}: Props) {
  const queryClient = useQueryClient();
  const userId = useAuthStore(state => state.user?.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Keep the same key for network retries to prevent double spending.
  const pendingRequestId = useRef<string | null>(null);
  const status = useQuery({
    queryKey: ["gafus-unlock-status", userId],
    queryFn: () => gafusApi.status(),
    enabled: Boolean(userId),
    staleTime: 15_000,
    retry: 1,
  });

  const unlock = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const clientRequestId = pendingRequestId.current ?? Crypto.randomUUID();
      pendingRequestId.current = clientRequestId;
      const result = await gafusApi.unlock({
        clientRequestId,
        target: { type: "COURSE_STEP", dayOnCourseId, stepOnDayId },
      });
      trackEvent({
        eventName: "button_click", platform: "mobile",
        pathOrScreen: "/training/day", elementId: "gafus-step-unlock-success",
      });
      pendingRequestId.current = null;
      await queryClient.invalidateQueries({ queryKey: ["gafus-status"] });
      await queryClient.invalidateQueries({ queryKey: ["gafus-unlock-status", userId] });
      await onUnlocked();
      if (result.spent > 0) {
        setError(null);
      }
    } catch (caught) {
      reportClientError(caught instanceof Error ? caught : new Error(String(caught)), {
        issueKey: "GafusStepUnlock",
        keys: { operation: "unlock_step_with_gafus", dayOnCourseId, stepOnDayId },
      });
      const code = (caught as Error & { code?: string }).code;
      if (code && code !== "GAFUS_INTERNAL_ERROR") pendingRequestId.current = null;
      setError(caught instanceof Error ? caught.message : "Не удалось открыть шаг");
    } finally {
      setBusy(false);
    }
  }, [busy, dayOnCourseId, stepOnDayId, onUnlocked, queryClient, userId]);

  if (status.isPending) return <Loading variant="inline" />;
  const data = status.data;
  if (!data?.enabled.economy || !data.enabled.spending) return null;

  const price = data.rules.courseStepCost;
  const insufficient = data.wallet.balance < price;
  return <View style={styles.card}>
    <Text style={styles.title}>Открыть шаг за Гафусы</Text>
    <Text style={styles.balance}>Баланс: {data.wallet.balance} 🐾 · Стоимость: {price}</Text>
    <Button
      label={busy ? "Открываем…" : "Открыть за Гафусы"}
      onPress={() => void unlock()}
      disabled={busy || insufficient}
      loading={busy}
      accessibilityRole="button"
    />
    {insufficient && <Text style={styles.hint}>
      Недостаточно Гафусов. Получайте их за активность в сообществе.
    </Text>}
    {error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
  </View>;
});

const styles = StyleSheet.create({
  card: { backgroundColor: "#FFF9E8", borderWidth: 1, borderColor: "#E6D9B5", borderRadius: 16, padding: SPACING.md, gap: 10, marginBottom: 10 },
  title: { fontSize: 16, fontWeight: "700", color: COLORS.text },
  balance: { fontSize: 14, color: COLORS.text },
  hint: { fontSize: 12, lineHeight: 18, color: "#777258" },
  error: { fontSize: 13, color: "#B44735" },
});
