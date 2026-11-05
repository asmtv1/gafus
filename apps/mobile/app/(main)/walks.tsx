import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { Text } from "react-native-paper";
import { TexturedSafeAreaView } from "@/shared/components";
import { COLORS, FONTS, SPACING } from "@/shared/config";
import { useAuthStore } from "@/shared/stores/authStore";
import { canUseDogWalkHistory } from "@/features/walk/walkAccess";
import { formatWalkLength, toWalkHistoryRows } from "@/features/walk/walkHistoryFormat";
import { formatWalkDistance, isWalkRunning } from "@/features/walk/walkModel";
import { getWalkWeekOverview } from "@/features/walk/walkOverview";
import { loadWalkJournal, type WalkJournal } from "@/features/walk/walkStorage";
import { syncDogWalkHistory } from "@/features/walk/walkSync";
import { reportClientError } from "@/shared/lib/tracer";

const CHART_HEIGHT = 76;
const HISTORY_LIMIT = 5;
const HISTORY_PAGE_SIZE = 10;

export default function WalksHistoryScreen() {
  const router = useRouter();
  const actor = useAuthStore((state) =>
    state.isAuthenticated &&
    !state.isLoading &&
    state.verifiedSessionEpoch &&
    canUseDogWalkHistory(state.user)
      ? (state.user?.id ?? null)
      : null,
  );
  const [journalState, setJournalState] = useState<{ ownerId: string; data: WalkJournal } | null>(
    null,
  );
  // Never render another account's locally cached history during account switches.
  const journal = journalState?.ownerId === actor ? journalState.data : null;
  const [refreshing, setRefreshing] = useState(false);
  const [syncWarning, setSyncWarning] = useState(false);
  const [visibleCount, setVisibleCount] = useState(HISTORY_LIMIT);
  const [loadError, setLoadError] = useState(false);

  const refresh = useCallback(async (id: string) => {
    setRefreshing(true);
    try {
      const local = await loadWalkJournal(id);
      setLoadError(false);
      if (useAuthStore.getState().user?.id !== id) return;
      setJournalState({ ownerId: id, data: local });
      try {
        const merged = await syncDogWalkHistory(id);
        if (useAuthStore.getState().user?.id === id) {
          setJournalState({ ownerId: id, data: merged });
          setSyncWarning(false);
        }
      } catch (error) {
        reportClientError(error, { issueKey: "DogWalkServerSync" });
        if (useAuthStore.getState().user?.id === id) setSyncWarning(true);
      }
    } catch (error) {
      reportClientError(error, { issueKey: "DogWalkLocalLoad" });
      if (useAuthStore.getState().user?.id === id) setLoadError(true);
    } finally {
      if (useAuthStore.getState().user?.id === id) setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setVisibleCount(HISTORY_LIMIT);
      if (actor) void refresh(actor);
      else {
        setJournalState(null);
        setLoadError(false);
        setSyncWarning(false);
      }
    }, [actor, refresh]),
  );

  if (!actor)
    return (
      <TexturedSafeAreaView style={styles.page}>
        <View style={styles.signedOut}>
          <MaterialCommunityIcons name="paw" size={34} color={COLORS.primary} />
          <Text style={styles.heading}>Прогулки</Text>
          <Text style={styles.secondary}>Для доступа к прогулкам войдите в аккаунт.</Text>
        </View>
      </TexturedSafeAreaView>
    );

  const rows = toWalkHistoryRows(journal?.completed ?? []);
  const overview = getWalkWeekOverview(journal?.completed ?? [], Date.now());
  const active = journal?.active;
  const walking = isWalkRunning(active ?? null);
  const maxSeconds = Math.max(1800, ...overview.days.map((day) => day.seconds));
  const openTimer = () => router.push("/(main)/walk" as Href);

  return (
    <TexturedSafeAreaView style={styles.page}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
            onRefresh={() => void refresh(actor)}
          />
        }
      >
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Назад"
            hitSlop={8}
          >
            <MaterialCommunityIcons name="chevron-left" size={27} color={COLORS.primaryDark} />
          </Pressable>
          <View style={styles.topTitles}>
            <Text style={styles.eyebrow}>ВРЕМЯ ВМЕСТЕ</Text>
            <Text style={styles.heading}>Прогулки</Text>
          </View>
          <View style={styles.topPaw}>
            <MaterialCommunityIcons name="paw" size={23} color={COLORS.primary} />
          </View>
        </View>

        <LinearGradient
          colors={["#697951", "#3D4D2F"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroOrbit} />
          <View style={styles.heroOrbitInner} />
          <Image
            source={require("../../assets/images/pet-type-dog.webp")}
            contentFit="contain"
            style={styles.heroDog}
            accessible={false}
          />
          <View style={styles.heroCopy}>
            <View style={styles.heroStatus}>
              <View style={[styles.statusDot, walking && styles.statusDotRunning]} />
              <Text style={styles.heroStatusText}>
                {active
                  ? walking
                    ? "ИДЁТ ПРОГУЛКА"
                    : "ПРОГУЛКА НА ПАУЗЕ"
                  : "ВАШЕ НОВОЕ ПРИКЛЮЧЕНИЕ"}
              </Text>
            </View>
            <Text style={styles.heroTitle}>
              {active ? "Ваш маршрут\nпродолжается" : "Навстречу\nновому дню"}
            </Text>
            <Text style={styles.heroDescription}>
              {active
                ? "Время, шаги и расстояние сохраняются, пока вы гуляете."
                : "Каждая прогулка — маленькая история о вас и вашей собаке."}
            </Text>
          </View>
          <Pressable
            onPress={openTimer}
            accessibilityRole="button"
            accessibilityLabel={active ? "Вернуться к таймеру прогулки" : "Начать прогулку"}
            style={({ pressed }) => [styles.heroButton, pressed && styles.pressed]}
          >
            <View style={styles.heroButtonIcon}>
              <MaterialCommunityIcons
                name={active ? "walk" : "play"}
                size={22}
                color={COLORS.onPrimary}
              />
            </View>
            <Text style={styles.heroButtonText}>
              {active ? "Вернуться к прогулке" : "Начать прогулку"}
            </Text>
            <MaterialCommunityIcons name="arrow-right" size={22} color={COLORS.primaryDark} />
          </Pressable>
        </LinearGradient>

        {syncWarning ? (
          <View style={styles.warningCard}>
            <MaterialCommunityIcons name="cloud-off-outline" size={23} color="#895C2D" />
            <View style={styles.warningCopy}>
              <Text style={styles.warningTitle}>Нет связи с сервером</Text>
              <Text style={styles.warningText}>
                Прогулки на телефоне сохранены. Синхронизацию можно повторить.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Повторить синхронизацию прогулок"
              onPress={() => void refresh(actor)}
              disabled={refreshing}
              hitSlop={10}
            >
              <MaterialCommunityIcons name="refresh" size={24} color="#895C2D" />
            </Pressable>
          </View>
        ) : null}

        <View style={styles.sectionTitleRow}>
          <View>
            <Text style={styles.sectionEyebrow}>ВАША АКТИВНОСТЬ</Text>
            <Text style={styles.sectionTitle}>На этой неделе</Text>
          </View>
          <View style={styles.weekChip}>
            <MaterialCommunityIcons name="calendar-week" size={16} color={COLORS.primary} />
            <Text style={styles.weekChipText}>Пн — Вс</Text>
          </View>
        </View>
        <View style={styles.statRow}>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, styles.statIconWalk]}>
              <MaterialCommunityIcons name="paw" color={COLORS.primary} size={19} />
            </View>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
              {overview.count}
            </Text>
            <Text style={styles.statLabel}>прогулок</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, styles.statIconTime]}>
              <MaterialCommunityIcons name="clock-outline" color="#926D31" size={19} />
            </View>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
              {overview.seconds ? formatWalkLength(overview.seconds) : "0 мин"}
            </Text>
            <Text style={styles.statLabel}>без пауз</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, styles.statIconDistance]}>
              <MaterialCommunityIcons name="map-marker-distance" color="#7A6040" size={19} />
            </View>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
              {formatWalkDistance(overview.meters)}
            </Text>
            <Text style={styles.statLabel}>расстояние</Text>
          </View>
        </View>
        <View style={styles.chartCard}>
          <View style={styles.chartTitleRow}>
            <View>
              <Text style={styles.chartTitle}>Ритм прогулок</Text>
              <Text style={styles.chartSubtitle}>Минуты завершённых прогулок</Text>
            </View>
            <MaterialCommunityIcons name="chart-bar" size={23} color={COLORS.primary} />
          </View>
          <View style={styles.chartRow}>
            {overview.days.map((day) => {
              const height = day.seconds
                ? Math.max(7, Math.round((day.seconds / maxSeconds) * CHART_HEIGHT))
                : 4;
              return (
                <View
                  key={day.timestamp}
                  accessible
                  accessibilityLabel={`${day.label}: ${formatWalkLength(day.seconds)}`}
                  style={styles.chartColumn}
                >
                  <View style={styles.barSlot}>
                    <View
                      style={[
                        styles.bar,
                        !day.seconds && styles.barEmpty,
                        day.isToday && styles.barToday,
                        { height },
                      ]}
                    />
                  </View>
                  <Text style={[styles.chartDay, day.isToday && styles.chartDayToday]}>
                    {day.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.sectionTitleRow}>
          <View>
            <Text style={styles.sectionEyebrow}>ВАШИ ВОСПОМИНАНИЯ</Text>
            <Text style={styles.sectionTitle}>История прогулок</Text>
          </View>
          {rows.length > 0 ? <Text style={styles.historyCount}>{rows.length} всего</Text> : null}
        </View>

        {loadError && !journal ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons name="alert-circle-outline" size={32} color="#895C2D" />
            <Text style={styles.emptyTitle}>Не удалось открыть историю</Text>
            <Text style={styles.emptySubtitle}>
              Данные телефона сейчас недоступны. Попробуйте снова, ваши прогулки не удалялись.
            </Text>
            <Pressable
              onPress={() => void refresh(actor)}
              accessibilityRole="button"
              accessibilityLabel="Повторить загрузку прогулок"
              style={styles.emptyAction}
            >
              <MaterialCommunityIcons name="refresh" size={18} color={COLORS.primary} />
              <Text style={styles.emptyActionText}>Повторить</Text>
            </Pressable>
          </View>
        ) : !journal ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.secondary}>Загружаем историю…</Text>
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIllustration}>
              <MaterialCommunityIcons name="paw" size={42} color={COLORS.primary} />
            </View>
            <Text style={styles.emptyTitle}>Первая прогулка впереди!</Text>
            <Text style={styles.emptySubtitle}>
              Начните прогулку, и здесь появятся ваши дни, время, шаги и расстояние.
            </Text>
            <Pressable onPress={openTimer} accessibilityRole="button" style={styles.emptyAction}>
              <Text style={styles.emptyActionText}>Отправиться гулять</Text>
              <MaterialCommunityIcons name="arrow-right" size={17} color={COLORS.primary} />
            </Pressable>
          </View>
        ) : (
          <>
            {rows.slice(0, visibleCount).map((row, index) => (
              <Pressable
                key={row.id}
                style={styles.historyCard}
                onPress={() =>
                  router.push(`/(main)/walk-route?walkId=${encodeURIComponent(row.id)}` as Href)
                }
                accessibilityRole="button"
                accessibilityLabel={`Показать маршрут прогулки ${row.day}`}
              >
                <View style={styles.historyBadge}>
                  <MaterialCommunityIcons name="paw" size={23} color={COLORS.primary} />
                </View>
                <View style={styles.historyBody}>
                  <View style={styles.historyHead}>
                    <Text style={styles.historyTitle} numberOfLines={2}>
                      {row.day}
                    </Text>
                    {index === 0 ? <Text style={styles.latestText}>Последняя</Text> : null}
                  </View>
                  <View style={styles.historyTimeRow}>
                    <MaterialCommunityIcons name="clock-outline" size={15} color="#867D71" />
                    <Text style={styles.historyTime}>
                      {row.departedAt} — {row.returnedAt}
                    </Text>
                  </View>
                  <View style={styles.historyMetrics}>
                    <View style={styles.historyMetric}>
                      <Text style={styles.historyMetricValue}>{row.duration}</Text>
                      <Text style={styles.historyMetricLabel}>без пауз</Text>
                    </View>
                    <View style={styles.historyMetricDivider} />
                    <View style={styles.historyMetric}>
                      <Text style={styles.historyMetricValue}>
                        {row.steps.toLocaleString("ru-RU")}
                      </Text>
                      <Text style={styles.historyMetricLabel}>шагов</Text>
                    </View>
                    <View style={styles.historyMetricDivider} />
                    <View style={styles.historyMetric}>
                      <Text style={styles.historyMetricValue}>
                        {row.hasGps ? "" : "≈"}
                        {formatWalkDistance(row.meters)}
                      </Text>
                      <Text style={styles.historyMetricLabel}>расстояние</Text>
                    </View>
                  </View>
                </View>
              </Pressable>
            ))}
            {rows.length > visibleCount ? (
              <Pressable
                style={styles.allHistory}
                onPress={() =>
                  setVisibleCount((count) => Math.min(rows.length, count + HISTORY_PAGE_SIZE))
                }
                accessibilityRole="button"
                accessibilityLabel="Показать ещё прогулки"
              >
                <Text style={styles.allHistoryText}>
                  Показать ещё ({rows.length - visibleCount})
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={20} color={COLORS.primary} />
              </Pressable>
            ) : visibleCount > HISTORY_LIMIT ? (
              <Pressable
                style={styles.allHistory}
                onPress={() => setVisibleCount(HISTORY_LIMIT)}
                accessibilityRole="button"
                accessibilityLabel="Свернуть историю прогулок"
              >
                <Text style={styles.allHistoryText}>Свернуть историю</Text>
                <MaterialCommunityIcons name="chevron-up" size={20} color={COLORS.primary} />
              </Pressable>
            ) : null}
          </>
        )}

        <View style={styles.privacyFooter}>
          <MaterialCommunityIcons name="shield-check-outline" size={18} color={COLORS.primary} />
          <Text style={styles.privacyText}>
            История доступна только вам. Телефон хранит прогулки и синхронизирует их с сервером. При
            доступном GPS показываем записанное расстояние и маршрут; иначе — приблизительное
            расстояние по шагам.
          </Text>
        </View>
      </ScrollView>
    </TexturedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 52, gap: 18 },
  pressed: { opacity: 0.76 },
  topBar: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 2 },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "#F5F0E5",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DED9CC",
  },
  topTitles: { flex: 1 },
  eyebrow: {
    color: "#777B62",
    fontSize: 10,
    fontFamily: FONTS.montserratBold,
    letterSpacing: 1.5,
    marginBottom: 1,
  },
  heading: {
    fontSize: 29,
    color: COLORS.text,
    fontFamily: FONTS.montserratBold,
    letterSpacing: -0.6,
  },
  topPaw: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "#DCE2CD",
    alignItems: "center",
    justifyContent: "center",
  },
  hero: { borderRadius: 26, padding: 22, minHeight: 282, overflow: "hidden" },
  heroOrbit: {
    position: "absolute",
    right: -90,
    top: -85,
    width: 265,
    height: 265,
    borderRadius: 140,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  heroOrbitInner: {
    position: "absolute",
    right: -28,
    top: -20,
    width: 148,
    height: 148,
    borderRadius: 80,
    backgroundColor: "rgba(237,229,210,0.13)",
  },
  heroDog: { position: "absolute", right: -4, top: 43, width: 134, height: 134, opacity: 0.95 },
  heroCopy: { paddingRight: 75, flex: 1, minHeight: 167 },
  heroStatus: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 12 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#EBD596" },
  statusDotRunning: { backgroundColor: "#BCE38C" },
  heroStatusText: {
    color: "#F2E5C7",
    fontSize: 9,
    fontFamily: FONTS.montserratBold,
    letterSpacing: 0.7,
  },
  heroTitle: {
    color: "#FFF9E9",
    fontSize: 26,
    fontFamily: FONTS.montserratBold,
    lineHeight: 32,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  heroDescription: { color: "#EFEBD9", fontSize: 12, lineHeight: 18, maxWidth: 224 },
  heroButton: {
    minHeight: 56,
    borderRadius: 17,
    backgroundColor: "#F6F0DF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingRight: 16,
    gap: 11,
  },
  heroButtonIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  heroButtonText: {
    flex: 1,
    color: COLORS.primaryDark,
    fontSize: 15,
    fontFamily: FONTS.montserratBold,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 2,
  },
  sectionEyebrow: {
    color: "#8E8A72",
    fontSize: 10,
    letterSpacing: 1.25,
    fontFamily: FONTS.montserratBold,
    marginBottom: 4,
  },
  sectionTitle: {
    color: COLORS.text,
    fontFamily: FONTS.montserratBold,
    fontSize: 21,
    letterSpacing: -0.5,
  },
  weekChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "#E1E7D8",
  },
  weekChipText: { fontSize: 11, fontWeight: "700", color: COLORS.primary },
  statRow: { flexDirection: "row", gap: 9 },
  statCard: {
    flex: 1,
    minWidth: 0,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "#FAF7EF",
    borderWidth: 1,
    borderColor: "#E6E1D3",
    gap: 4,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  statIconWalk: { backgroundColor: "#E1E8D6" },
  statIconTime: { backgroundColor: "#F3E8CF" },
  statIconDistance: { backgroundColor: "#EEE3D8" },
  statValue: { fontSize: 20, color: COLORS.text, fontFamily: FONTS.montserratBold },
  statLabel: { color: "#7C776D", fontSize: 11 },
  chartCard: {
    paddingHorizontal: 19,
    paddingTop: 19,
    paddingBottom: 15,
    borderRadius: 23,
    backgroundColor: "#F8F5ED",
    borderWidth: 1,
    borderColor: "#E5E0D3",
  },
  chartTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chartTitle: { color: COLORS.text, fontSize: 16, fontFamily: FONTS.montserratBold },
  chartSubtitle: { color: "#817B70", fontSize: 12, marginTop: 3 },
  chartRow: { flexDirection: "row", alignItems: "flex-end", marginTop: 12, gap: 8 },
  chartColumn: { flex: 1, alignItems: "center", gap: 8 },
  barSlot: {
    height: CHART_HEIGHT,
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  bar: { width: "64%", maxWidth: 25, minWidth: 11, borderRadius: 7, backgroundColor: "#A7B58A" },
  barToday: { backgroundColor: COLORS.primary },
  barEmpty: { backgroundColor: "#E4E4D9" },
  chartDay: { fontSize: 11, color: "#908C7F", fontWeight: "600" },
  chartDayToday: { color: COLORS.primaryDark, fontWeight: "800" },
  historyCount: { color: "#7A7B69", fontSize: 12, paddingBottom: 3 },
  historyCard: {
    flexDirection: "row",
    gap: 12,
    padding: 15,
    borderRadius: 20,
    backgroundColor: "#FBF8F0",
    borderColor: "#E5E0D4",
    borderWidth: 1,
  },
  historyBadge: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: "#E3EAD9",
    alignItems: "center",
    justifyContent: "center",
  },
  historyBody: { flex: 1, minWidth: 0 },
  historyHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
    alignItems: "center",
  },
  historyTitle: {
    color: COLORS.text,
    fontFamily: FONTS.montserratBold,
    fontSize: 14,
    flexShrink: 1,
  },
  latestText: { color: "#71815B", fontSize: 10, fontWeight: "700" },
  historyTimeRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 5 },
  historyTime: { color: "#817C71", fontSize: 12 },
  historyMetrics: {
    marginTop: 14,
    paddingTop: 12,
    borderTopColor: "#EAE5D9",
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  historyMetric: { flex: 1, minWidth: 0, gap: 3 },
  historyMetricDivider: { width: 1, height: 26, backgroundColor: "#E3DED3" },
  historyMetricValue: { color: COLORS.text, fontSize: 12, fontWeight: "800" },
  historyMetricLabel: { fontSize: 10, color: "#858075" },
  allHistory: {
    padding: 15,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#C5CDB5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  allHistoryText: { fontSize: 14, color: COLORS.primary, fontWeight: "700" },
  emptyCard: {
    borderRadius: 24,
    backgroundColor: "#F9F5EC",
    borderWidth: 1,
    borderColor: "#E5E0D4",
    alignItems: "center",
    padding: 27,
    gap: 9,
  },
  emptyIllustration: {
    width: 82,
    height: 82,
    borderRadius: 28,
    backgroundColor: "#E3EAD9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 5,
    transform: [{ rotate: "-8deg" }],
  },
  emptyTitle: {
    fontFamily: FONTS.montserratBold,
    color: COLORS.text,
    fontSize: 17,
    textAlign: "center",
  },
  emptySubtitle: { fontSize: 13, lineHeight: 20, textAlign: "center", color: "#777365" },
  emptyAction: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 10, padding: 8 },
  emptyActionText: { fontSize: 13, fontWeight: "700", color: COLORS.primary },
  loadingCard: { padding: 30, alignItems: "center", gap: 12 },
  secondary: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 21 },
  warningCard: {
    backgroundColor: "#FFF1D8",
    padding: 13,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  warningCopy: { flex: 1 },
  warningTitle: { fontWeight: "800", fontSize: 12, color: "#74481C" },
  warningText: { fontSize: 11, lineHeight: 16, marginTop: 3, color: "#895C2D" },
  privacyFooter: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    paddingHorizontal: 5,
    paddingTop: 3,
  },
  privacyText: { flex: 1, color: "#777469", fontSize: 11, lineHeight: 17 },
  signedOut: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.lg,
    gap: 12,
  },
});
