import { useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { GafusHistoryEntry, GafusStatusDto } from "@gafus/types";

import { COLORS, FONTS } from "@/shared/config";

const HISTORY_TITLES: Record<string, string> = {
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

function historyName(item: GafusHistoryEntry) {
  return HISTORY_TITLES[item.rewardKind ?? item.kind] ?? "Операция";
}

function formatHistoryDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${time}`;
}

function numberWithUnit(value: number, [one, few, many]: [string, string, string]) {
  const n = Math.abs(value);
  const lastTwo = n % 100;
  const last = n % 10;
  return `${value} ${lastTwo >= 11 && lastTwo <= 14 ? many : last === 1 ? one : last >= 2 && last <= 4 ? few : many}`;
}

/** Compact money-app pattern: one balance tile, one information group, dense history rows. */
export function GafusWalletOverview({
  data,
  history,
  canLoadMore,
  loadingMore,
  onLoadMore,
}: {
  data: GafusStatusDto;
  history: GafusHistoryEntry[];
  canLoadMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const [showBonusDetails, setShowBonusDetails] = useState(false);
  const days = Math.round(data.rules.accessDurationSeconds / 86400);
  return (
    <View style={styles.overview}>
      <View style={styles.balance}>
        <View style={styles.balanceLabel}>
          <View style={styles.paw}>
            <MaterialCommunityIcons name="paw" size={19} color={COLORS.primary} />
          </View>
          <View style={styles.balanceLabelText}>
            <Text style={styles.balanceTitle}>Баланс</Text>
            <Text style={styles.muted}>Внутренняя валюта</Text>
          </View>
        </View>
        <Text
          style={styles.balanceAmount}
          numberOfLines={1}
          adjustsFontSizeToFit
          accessibilityLabel={`Баланс: ${data.wallet.balance} Гафусов`}
        >
          {new Intl.NumberFormat("ru-RU").format(data.wallet.balance)}
        </Text>
      </View>

      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <View style={styles.infoIcon}>
            <MaterialCommunityIcons name="lightning-bolt-outline" size={19} color={COLORS.primary} />
          </View>
          <View style={styles.infoText}>
            <Text style={styles.infoTitle}>За активность</Text>
            <Text style={styles.description}>
              Посты, вопросы и помощь другим · до {data.activity.limit} за 24 часа
            </Text>
            <Text style={styles.remaining}>
              Осталось за обычную активность: {data.activity.remaining}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Бонусные Гафусы сверх лимита"
              accessibilityState={{ expanded: showBonusDetails }}
              onPress={() => setShowBonusDetails(current => !current)}
              style={({ pressed }) => [styles.bonusToggle, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons
                name="information-outline"
                size={16}
                color={COLORS.primary}
              />
              <Text style={styles.bonusToggleText}>Бонусы сверх лимита</Text>
              <MaterialCommunityIcons
                name={showBonusDetails ? "chevron-up" : "chevron-down"}
                size={17}
                color={COLORS.primary}
              />
            </Pressable>
            {showBonusDetails && (
              <View style={styles.bonusGroup}>
                <Text style={styles.description}>
                  +{data.rules.reactionReward} за каждые {data.rules.reactionThreshold} лайков
                  или других реакций от разных пользователей на ваш пост в «Моментах».
                </Text>
                <Text style={styles.description}>
                  +{data.rules.bestAnswerReward}, если ваш ответ в «Вопросах» выберут лучшим.
                </Text>
                <Text style={styles.bonusNote}>
                  Эти награды можно получать сверх лимита за 24 часа.
                </Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.divider} />
        <View style={styles.infoRow}>
          <View style={styles.infoIcon}>
            <MaterialCommunityIcons name="book-open-outline" size={19} color={COLORS.primary} />
          </View>
          <View style={styles.infoText}>
            <Text style={styles.infoTitle}>На обучение</Text>
            <Text style={styles.description}>
              Шаг курса — {numberWithUnit(data.rules.courseStepCost, ["Гафус", "Гафуса", "Гафусов"])}
              {" · "}мини-гайд — {numberWithUnit(data.rules.miniGuideCost, ["Гафус", "Гафуса", "Гафусов"])}
            </Text>
            <Text style={styles.muted}>Доступ на {numberWithUnit(days, ["день", "дня", "дней"])}</Text>
          </View>
        </View>
      </View>

      {!data.enabled.economy && (
        <Text style={styles.note}>Система мотивации пока не включена.</Text>
      )}

      <View style={styles.historyCard}>
        <Text style={styles.historyHeading}>История операций</Text>
        {history.length === 0 ? (
          <Text style={styles.emptyHistory}>Пока нет операций. Первый Гафус ещё впереди!</Text>
        ) : history.map((item, index) => (
          <View key={item.id}>
            {index > 0 && <View style={styles.historyDivider} />}
            <View style={styles.historyRow}>
              <View style={styles.historyDescription}>
                <Text style={styles.historyName} numberOfLines={1}>{historyName(item)}</Text>
                <Text style={styles.historyDate}>{formatHistoryDate(item.createdAt)}</Text>
              </View>
              <Text
                style={[styles.delta, item.delta >= 0 ? styles.positive : styles.negative]}
                numberOfLines={1}
                accessibilityLabel={`Изменение баланса: ${item.delta > 0 ? "+" : ""}${item.delta} Гафусов`}
              >
                {item.delta > 0 ? "+" : ""}{item.delta}
              </Text>
            </View>
          </View>
        ))}
        {canLoadMore && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Показать ещё операции"
            disabled={loadingMore}
            onPress={onLoadMore}
            style={({ pressed }) => [
              styles.moreButton,
              pressed && styles.pressed,
              loadingMore && styles.moreDisabled,
            ]}
          >
            <Text style={styles.moreText}>{loadingMore ? "Загрузка…" : "Показать ещё"}</Text>
            {!loadingMore && (
              <MaterialCommunityIcons name="chevron-down" size={18} color={COLORS.primary} />
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overview: { gap: 10 },
  balance: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10,
    paddingHorizontal: 14, paddingVertical: 13, borderRadius: 16,
    borderWidth: 1, borderColor: "#E9DDB8", backgroundColor: "#FFF3D5",
  },
  balanceLabel: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 9 },
  paw: {
    width: 32, height: 32, borderRadius: 11, backgroundColor: "#EBE7CE",
    alignItems: "center", justifyContent: "center",
  },
  balanceLabelText: { flex: 1, minWidth: 0, gap: 2 },
  balanceTitle: {
    color: COLORS.text, fontFamily: FONTS.montserratBold, fontSize: 15, lineHeight: 20,
  },
  balanceAmount: {
    flexShrink: 1, color: "#414C2D", fontFamily: FONTS.montserratBold,
    fontSize: 32, lineHeight: 39, textAlign: "right",
  },
  muted: {
    color: "#78806F", fontFamily: FONTS.montserrat, fontSize: 11, lineHeight: 16,
  },
  infoCard: {
    backgroundColor: "#FFFDF8", borderRadius: 16, borderWidth: 1,
    borderColor: "#E9E5DB", paddingHorizontal: 14, paddingVertical: 3,
  },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 11 },
  infoIcon: {
    width: 30, height: 30, borderRadius: 10, backgroundColor: "#EDF1E4",
    alignItems: "center", justifyContent: "center",
  },
  infoText: { flex: 1, minWidth: 0, gap: 2 },
  infoTitle: {
    color: COLORS.text, fontFamily: FONTS.montserratBold, fontSize: 14, lineHeight: 19,
  },
  description: {
    color: "#6B7167", fontFamily: FONTS.montserrat, fontSize: 12, lineHeight: 18,
  },
  bonusToggle: {
    alignSelf: "flex-start", flexDirection: "row", alignItems: "center",
    gap: 4, minHeight: 32, paddingRight: 6, marginTop: 2,
  },
  bonusToggleText: {
    color: COLORS.primary, fontFamily: FONTS.montserratMedium,
    fontSize: 11, lineHeight: 16,
  },
  bonusGroup: {
    gap: 6, marginTop: 3, padding: 10, backgroundColor: "#F5F7EF", borderRadius: 10,
  },
  bonusNote: {
    color: COLORS.primary, fontFamily: FONTS.montserratMedium,
    fontSize: 11, lineHeight: 16,
  },
  remaining: {
    color: COLORS.primary, fontFamily: FONTS.montserratMedium,
    fontSize: 12, lineHeight: 17, marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth, backgroundColor: "#EAE8DE", marginLeft: 40,
  },
  note: {
    paddingHorizontal: 12, paddingVertical: 10, color: "#705B37",
    backgroundColor: "#FBF0DC", borderRadius: 12,
    fontFamily: FONTS.montserrat, fontSize: 12, lineHeight: 17,
  },
  historyCard: {
    backgroundColor: "#FFFDF8", borderRadius: 16, borderWidth: 1,
    borderColor: "#E9E5DB", paddingHorizontal: 14, paddingTop: 13, paddingBottom: 5,
  },
  historyHeading: {
    color: COLORS.text, fontFamily: FONTS.montserratBold,
    fontSize: 15, lineHeight: 20, marginBottom: 5,
  },
  historyRow: {
    minHeight: 48, flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", gap: 10, paddingVertical: 7,
  },
  historyDescription: { flex: 1, minWidth: 0, gap: 2 },
  historyName: {
    color: COLORS.text, fontFamily: FONTS.montserratMedium, fontSize: 12, lineHeight: 17,
  },
  historyDate: {
    color: "#83877B", fontFamily: FONTS.montserrat, fontSize: 10, lineHeight: 14,
  },
  historyDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "#EAE8DE" },
  delta: { fontFamily: FONTS.montserratBold, fontSize: 16, lineHeight: 21 },
  positive: { color: COLORS.primary },
  negative: { color: "#AD6E38" },
  emptyHistory: {
    paddingVertical: 12, color: "#6B7167", fontFamily: FONTS.montserrat,
    fontSize: 12, lineHeight: 18,
  },
  moreButton: {
    minHeight: 44, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 5, marginTop: 4,
  },
  moreText: { fontFamily: FONTS.montserratMedium, fontSize: 12, color: COLORS.primary },
  pressed: { opacity: 0.68 },
  moreDisabled: { opacity: 0.5 },
});
