import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text, Snackbar } from "react-native-paper";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";

import { Loading, PageHeader, TexturedSafeAreaView } from "@/shared/components";
import { Button, Card, Input } from "@/shared/components/ui";
import { partnersApi } from "@/shared/lib/api";
import { COLORS, SPACING } from "@/shared/config";
import { hapticFeedback } from "@/shared/lib/utils/haptics";

const PARTNER_QUERY_KEY = ["partner-dashboard"] as const;

function formatRubles(kopecks: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format(kopecks / 100);
}

export default function PartnerScreen() {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const dashboardQuery = useQuery({
    queryKey: PARTNER_QUERY_KEY,
    queryFn: async () => {
      const response = await partnersApi.getDashboard();
      if (!response.success || !response.data) {
        throw new Error(response.error ?? "Не удалось загрузить кабинет партнёра");
      }
      return response.data;
    },
  });
  const dashboard = dashboardQuery.data;
  const referralLink = useMemo(
    () => (dashboard ? `https://gafus.ru/register?promoCode=${encodeURIComponent(dashboard.referralCode)}` : ""),
    [dashboard],
  );

  const payoutMutation = useMutation({
    mutationFn: async (amountKopecks: number) => {
      const response = await partnersApi.requestPayout(amountKopecks);
      if (!response.success) throw new Error(response.error ?? "Не удалось создать заявку на выплату");
      return response.data;
    },
    onSuccess: async () => {
      setAmount("");
      setMessage("Заявка на выплату принята.");
      await queryClient.invalidateQueries({ queryKey: PARTNER_QUERY_KEY });
      await hapticFeedback.success();
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Не удалось создать заявку"),
  });

  const copyLink = async () => {
    if (!referralLink) return;
    await Clipboard.setStringAsync(referralLink);
    setMessage("Ссылка скопирована");
    await hapticFeedback.success();
  };

  const requestPayout = () => {
    const amountKopecks = Math.round(Number(amount.replace(",", ".")) * 100);
    if (!Number.isSafeInteger(amountKopecks) || amountKopecks <= 0) {
      setMessage("Укажите сумму больше нуля.");
      return;
    }
    payoutMutation.mutate(amountKopecks);
  };

  return (
    <TexturedSafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} contentInsetAdjustmentBehavior="automatic">
        <PageHeader
          title="Партнёрская программа"
          description="Приглашайте новых учеников и следите за вознаграждением."
        />
        {dashboardQuery.isLoading ? (
          <Loading variant="inline" message="Загружаем партнёрский кабинет…" />
        ) : null}
        {dashboardQuery.isError ? (
          <Card><Card.Content><Text style={styles.error}>{dashboardQuery.error.message}</Text><Button label="Повторить" variant="outline" onPress={() => void dashboardQuery.refetch()} /></Card.Content></Card>
        ) : null}
        {dashboard ? (
          <>
            <Card><Card.Content>
              <Text style={styles.cardTitle}>Ваша ссылка для приглашения</Text>
              <Text style={styles.muted}>Новый ученик зарегистрируется по ней, а приглашение закрепится за вами.</Text>
              <Text selectable style={styles.link}>{referralLink}</Text>
              <Button label="Скопировать ссылку" variant="secondary" onPress={() => void copyLink()} />
            </Card.Content></Card>
            <Card><Card.Content>
              <Text style={styles.cardTitle}>Статистика</Text>
              <View style={styles.stats}>
                <Stat label="Приглашено учеников" value={String(dashboard.referrals)} />
                <Stat label="Начислено" value={formatRubles(dashboard.earnedKopecks)} />
                <Stat label="В заявках" value={formatRubles(dashboard.reservedKopecks)} />
                <Stat label="Доступно к выплате" value={formatRubles(dashboard.availableKopecks)} emphasis />
              </View>
            </Card.Content></Card>
            <Card><Card.Content>
              <Text style={styles.cardTitle}>Заявка на выплату</Text>
              <Text style={styles.muted}>Укажите сумму в рублях. Мы свяжемся с вами для выплаты.</Text>
              <Input label="Сумма, ₽" value={amount} onChangeText={setAmount} placeholder="Например, 500" keyboardType="decimal-pad" style={styles.amountInput} />
              <Button
                label={payoutMutation.isPending ? "Отправляем…" : "Запросить выплату"}
                disabled={payoutMutation.isPending || dashboard.availableKopecks <= 0}
                loading={payoutMutation.isPending}
                onPress={requestPayout}
              />
            </Card.Content></Card>
          </>
        ) : null}
      </ScrollView>
      <Snackbar visible={Boolean(message)} onDismiss={() => setMessage("")} duration={4000}>{message}</Snackbar>
    </TexturedSafeAreaView>
  );
}

function Stat({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <View style={[styles.stat, emphasis && styles.statEmphasis]}><Text style={styles.statLabel}>{label}</Text><Text selectable style={styles.statValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background }, scroll: { padding: SPACING.md, paddingBottom: SPACING.xl, gap: SPACING.sm },
  info: { color: COLORS.textSecondary, textAlign: "center" }, error: { color: "#8B4513", marginBottom: SPACING.md },
  cardTitle: { color: COLORS.text, fontSize: 19, fontWeight: "700", marginBottom: SPACING.xs }, muted: { color: COLORS.textSecondary, lineHeight: 21, marginBottom: SPACING.md },
  link: { color: COLORS.primaryDark, backgroundColor: "rgba(99, 97, 40, 0.1)", padding: SPACING.sm, borderRadius: 10, marginBottom: SPACING.md },
  stats: { gap: SPACING.sm }, stat: { paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border }, statEmphasis: { borderBottomWidth: 0, backgroundColor: "rgba(99, 97, 40, 0.12)", borderRadius: 10, paddingHorizontal: SPACING.sm },
  statLabel: { color: COLORS.textSecondary, fontSize: 13 }, statValue: { color: COLORS.text, fontSize: 20, fontWeight: "700", marginTop: 2, fontVariant: ["tabular-nums"] }, amountInput: { marginBottom: SPACING.md },
});
