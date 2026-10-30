import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text, Snackbar } from "react-native-paper";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";

import { Loading, PageHeader, TexturedSafeAreaView } from "@/shared/components";
import { Button, Card, Input } from "@/shared/components/ui";
import { partnersApi } from "@/shared/lib/api";
import { COLORS, SPACING } from "@/shared/config";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { useAuthStore } from "@/shared/stores";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { reportClientError } from "@/shared/lib/tracer";

function formatRubles(kopecks: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format(kopecks / 100);
}

function parseKopecks(input: string): number | null {
  const value = input.trim().replace(",", ".");
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(value)) return null;
  const [rubles, fraction = ""] = value.split(".");
  const kopecks = Number(rubles) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(kopecks) && kopecks > 0 ? kopecks : null;
}

export default function PartnerScreen() {
  const owner = useAuthStore((s) =>
    s.isAuthenticated && !s.isLoading ? (s.user?.id ?? null) : null,
  );
  const verified = newOnlyV2NativeQueues.getVerifiedBinding();
  const epoch = owner && verified?.principalId === owner ? verified.authEpoch : null;
  if (!owner || !epoch)
    return (
      <TexturedSafeAreaView style={styles.container} edges={["top"]}>
        <Text style={styles.info}>Для просмотра партнёрского кабинета войдите в аккаунт.</Text>
      </TexturedSafeAreaView>
    );
  return <PartnerActor key={`${owner}:${epoch}`} owner={owner} epoch={epoch} />;
}

function PartnerActor({ owner, epoch }: { owner: string; epoch: string }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const mounted = useRef(true);
  const payoutInFlight = useRef(false);
  const retryInFlight = useRef(false);
  const copyInFlight = useRef(false);
  const unknownRef = useRef(false);
  const acknowledged = useRef(false);
  const current = () => {
    const auth = useAuthStore.getState();
    const binding = newOnlyV2NativeQueues.getVerifiedBinding();
    return (
      mounted.current &&
      auth.isAuthenticated &&
      !auth.isLoading &&
      auth.user?.id === owner &&
      binding?.principalId === owner &&
      binding.authEpoch === epoch
    );
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const queryKey = ["partner-dashboard", owner, epoch] as const;
  const dashboardQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await partnersApi.getDashboard();
      if (!response.success || !response.data) throw new Error("PARTNER_DASHBOARD_UNAVAILABLE");
      return response.data;
    },
  });
  const dashboard =
    dashboardQuery.isError || dashboardQuery.isPending ? undefined : dashboardQuery.data;
  const referralLink = useMemo(
    () =>
      dashboard
        ? `https://gafus.ru/register?promoCode=${encodeURIComponent(dashboard.referralCode)}`
        : "",
    [dashboard],
  );
  const retry = async () => {
    if (retryInFlight.current || !current()) return;
    retryInFlight.current = true;
    try {
      const response = await dashboardQuery.refetch();
      if (current() && response.isError) setMessage("Не удалось обновить кабинет партнёра.");
    } catch {
      if (current()) {
        reportClientError(new Error("PARTNER_DASHBOARD_REFRESH_FAILED"), {
          issueKey: "PartnerScreen",
          keys: { operation: "refresh" },
        });
        setMessage("Не удалось обновить кабинет партнёра.");
      }
    } finally {
      retryInFlight.current = false;
    }
  };
  const copyLink = async () => {
    if (copyInFlight.current || !referralLink || !current()) return;
    copyInFlight.current = true;
    try {
      await Clipboard.setStringAsync(referralLink);
      if (!current()) return;
      setMessage("Ссылка скопирована");
      try {
        await hapticFeedback.success();
      } catch {
        if (current())
          reportClientError(new Error("PARTNER_COPY_HAPTIC_FAILED"), {
            issueKey: "PartnerScreen",
            keys: { operation: "haptic" },
          });
      }
    } catch {
      if (current()) {
        reportClientError(new Error("PARTNER_COPY_FAILED"), {
          issueKey: "PartnerScreen",
          keys: { operation: "copy" },
        });
        setMessage("Не удалось скопировать ссылку.");
      }
    } finally {
      copyInFlight.current = false;
    }
  };
  const requestPayout = async () => {
    if (
      payoutInFlight.current ||
      unknownRef.current ||
      acknowledged.current ||
      !current() ||
      !dashboard?.active
    )
      return;
    const amountKopecks = parseKopecks(amount);
    if (!amountKopecks || amountKopecks > dashboard.availableKopecks) {
      setMessage(
        "Укажите сумму в пределах доступного баланса, не более двух знаков после запятой.",
      );
      return;
    }
    payoutInFlight.current = true;
    setPayoutBusy(true);
    setMessage("");
    let confirmed = false;
    try {
      const response = await partnersApi.requestPayout(amountKopecks);
      if (!current()) return;
      if (!response.success || !response.data?.id) {
        unknownRef.current = true;
        setUnknown(true);
        setMessage("Результат заявки неизвестен. Проверьте её статус перед повторной отправкой.");
        return;
      }
      confirmed = true;
      acknowledged.current = true;
      setAmount("");
      setMessage("Заявка на выплату принята.");
      try {
        await queryClient.invalidateQueries({ queryKey });
      } catch {
        if (current())
          reportClientError(new Error("PARTNER_PAYOUT_CACHE_FAILED"), {
            issueKey: "PartnerScreen",
            keys: { operation: "invalidate" },
          });
      }
      if (current()) {
        try {
          await hapticFeedback.success();
        } catch {
          if (current())
            reportClientError(new Error("PARTNER_PAYOUT_HAPTIC_FAILED"), {
              issueKey: "PartnerScreen",
              keys: { operation: "haptic" },
            });
        }
      }
    } catch {
      if (current()) {
        if (confirmed) {
          reportClientError(new Error("PARTNER_PAYOUT_POST_ACK_FAILED"), {
            issueKey: "PartnerScreen",
            keys: { operation: "post_ack" },
          });
          setMessage("Заявка на выплату принята. Не удалось обновить кабинет.");
        } else {
          unknownRef.current = true;
          setUnknown(true);
          reportClientError(new Error("PARTNER_PAYOUT_OUTCOME_UNKNOWN"), {
            issueKey: "PartnerScreen",
            keys: { operation: "payout" },
          });
          setMessage("Результат заявки неизвестен. Проверьте её статус перед повторной отправкой.");
        }
      }
    } finally {
      payoutInFlight.current = false;
      if (current()) setPayoutBusy(false);
    }
  };

  return (
    <TexturedSafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} contentInsetAdjustmentBehavior="automatic">
        <PageHeader
          title="Партнёрская программа"
          description="Приглашайте новых учеников и следите за вознаграждением."
        />
        {dashboardQuery.isPending ? (
          <Loading variant="inline" message="Загружаем партнёрский кабинет…" />
        ) : null}
        {dashboardQuery.isError ? (
          <Card>
            <Card.Content>
              <Text style={styles.error}>Не удалось загрузить кабинет партнёра.</Text>
              <Button label="Повторить" variant="outline" onPress={() => void retry()} />
            </Card.Content>
          </Card>
        ) : null}
        {dashboard ? (
          <>
            <Card>
              <Card.Content>
                <Text style={styles.cardTitle}>Ваша ссылка для приглашения</Text>
                <Text style={styles.muted}>
                  Новый ученик зарегистрируется по ней, а приглашение закрепится за вами.
                </Text>
                <Text selectable style={styles.link}>
                  {referralLink}
                </Text>
                <Button
                  label="Скопировать ссылку"
                  variant="secondary"
                  onPress={() => void copyLink()}
                />
              </Card.Content>
            </Card>
            <Card>
              <Card.Content>
                <Text style={styles.cardTitle}>Статистика</Text>
                <View style={styles.stats}>
                  <Stat label="Приглашено учеников" value={String(dashboard.referrals)} />
                  <Stat label="Начислено" value={formatRubles(dashboard.earnedKopecks)} />
                  <Stat label="В заявках" value={formatRubles(dashboard.reservedKopecks)} />
                  <Stat
                    label="Доступно к выплате"
                    value={formatRubles(dashboard.availableKopecks)}
                    emphasis
                  />
                </View>
              </Card.Content>
            </Card>
            <Card>
              <Card.Content>
                <Text style={styles.cardTitle}>Заявка на выплату</Text>
                <Text style={styles.muted}>
                  Укажите сумму в рублях. Мы свяжемся с вами для выплаты.
                </Text>
                <Input
                  label="Сумма, ₽"
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="Например, 500"
                  keyboardType="decimal-pad"
                  style={styles.amountInput}
                />
                <Button
                  label={payoutBusy ? "Отправляем…" : "Запросить выплату"}
                  disabled={
                    payoutBusy ||
                    unknown ||
                    acknowledged.current ||
                    !dashboard.active ||
                    dashboard.availableKopecks <= 0
                  }
                  loading={payoutBusy}
                  onPress={() => void requestPayout()}
                />
              </Card.Content>
            </Card>
          </>
        ) : null}
      </ScrollView>
      <Snackbar
        visible={Boolean(message)}
        onDismiss={() => {
          if (current()) setMessage("");
        }}
        duration={4000}
      >
        {message}
      </Snackbar>
    </TexturedSafeAreaView>
  );
}

function Stat({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <View style={[styles.stat, emphasis && styles.statEmphasis]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text selectable style={styles.statValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: SPACING.md, paddingBottom: SPACING.xl, gap: SPACING.sm },
  info: { color: COLORS.textSecondary, textAlign: "center" },
  error: { color: "#8B4513", marginBottom: SPACING.md },
  cardTitle: { color: COLORS.text, fontSize: 19, fontWeight: "700", marginBottom: SPACING.xs },
  muted: { color: COLORS.textSecondary, lineHeight: 21, marginBottom: SPACING.md },
  link: {
    color: COLORS.primaryDark,
    backgroundColor: "rgba(99, 97, 40, 0.1)",
    padding: SPACING.sm,
    borderRadius: 10,
    marginBottom: SPACING.md,
  },
  stats: { gap: SPACING.sm },
  stat: {
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  statEmphasis: {
    borderBottomWidth: 0,
    backgroundColor: "rgba(99, 97, 40, 0.12)",
    borderRadius: 10,
    paddingHorizontal: SPACING.sm,
  },
  statLabel: { color: COLORS.textSecondary, fontSize: 13 },
  statValue: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "700",
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  amountInput: { marginBottom: SPACING.md },
});
