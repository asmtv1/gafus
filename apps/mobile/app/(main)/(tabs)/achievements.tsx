import { useCallback, useMemo, useRef, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Pressable } from "react-native";
import { Text, Button } from "react-native-paper";
import { useFocusEffect, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Loading } from "@/shared/components/ui";
import { TexturedSafeAreaView } from "@/shared/components";
import {
  achievementsForActor,
  achievementsCoursesForActor,
  sameAchievementActor,
  verifiedAchievementActor,
} from "@/shared/lib/api/achievementsQuery";
import { useAuthStore } from "@/shared/stores/authStore";
import { openAppSubscriptionPaywall } from "@/features/app-subscription";
import { reportClientError } from "@/shared/lib/tracer";
import { type CourseListItem } from "@/shared/lib/api";
import type { AchievementWire } from "@gafus/types";
import { COLORS, SPACING, FONTS } from "@/shared/config";

const CARD_BG = COLORS.cardBackground;
const CARD_BORDER = "#B6C582";
const STAT_VALUE = "#007bff";
const LOCKED_BG = COLORS.cardBackground;

function getCategoryTitle(category: string): string {
  const map: Record<string, string> = {
    courses: "Курсы",
    progress: "Прогресс",
    streak: "Серии",
    social: "Социальные",
    special: "Специальные",
  };
  return map[category] ?? category;
}

/**
 * Страница достижений — логика и дизайн как на web (мобильная версия).
 */
export default function AchievementsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // A new A→B→A login has a new verified native epoch, even for the same id.
  // Subscribe to auth changes as well as checking the binding on every render.
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const authLoading = useAuthStore((state) => state.isLoading);
  const currentUser = useAuthStore((state) => state.user);
  const userId = currentUser?.id ?? null;
  const actorSnapshot =
    isAuthenticated && !authLoading && userId ? verifiedAchievementActor() : null;
  const actorOwnerId = actorSnapshot?.ownerId ?? null;
  const actorEpoch = actorSnapshot?.authEpoch ?? null;
  // Stable reference prevents repeated focus/refetch effects while auth stays unchanged.
  const actor = useMemo(
    () => (actorOwnerId && actorEpoch ? { ownerId: actorOwnerId, authEpoch: actorEpoch } : null),
    [actorOwnerId, actorEpoch],
  );
  const actorKey = actor ? `${actor.ownerId}:${actor.authEpoch}` : null;
  const [focusProof, setFocusProof] = useState<string | null>(null);
  type FocusScope = { actorKey: string | null; active: boolean };
  const activeFocus = useRef<FocusScope | null>(null);
  const activeRead = useRef<{ scope: FocusScope } | null>(null);
  const [failedFocus, setFailedFocus] = useState<FocusScope | null>(null);
  const {
    data: achievementsRes,
    isPending: achievementsPending,
    isFetching: achievementsFetching,
    isError: achievementsError,
    refetch: refetchAchievements,
  } = useQuery(achievementsForActor(actor));

  const refetchFresh = useCallback(async () => {
    const scope = activeFocus.current;
    if (!scope || !scope.active || scope.actorKey !== actorKey ||
      !actor || !sameAchievementActor(actor) || activeRead.current?.scope === scope) return;
    const flight = { scope };
    activeRead.current = flight;
    setFocusProof(null);
    setFailedFocus(null);
    const current = () => scope.active && activeFocus.current === scope &&
      sameAchievementActor(actor);
    try {
      const response = await refetchAchievements();
      if (!current()) return;
      if (response.isError || !response.data) {
        setFailedFocus(scope);
        reportClientError(new Error("ACHIEVEMENTS_READ_REFRESH_FAILED"), {
          issueKey: "Achievements",
          keys: { operation: "read_refresh" },
        });
      } else setFocusProof(actorKey);
    } catch {
      if (current()) {
        setFailedFocus(scope);
        reportClientError(new Error("ACHIEVEMENTS_READ_REFRESH_FAILED"), {
          issueKey: "Achievements",
          keys: { operation: "read_refresh" },
        });
      }
    } finally {
      if (activeRead.current === flight) activeRead.current = null;
    }
  }, [actor, actorKey, refetchAchievements]);
  useFocusEffect(
    useCallback(() => {
      const scope: FocusScope = { actorKey, active: true };
      activeFocus.current = scope;
      setFocusProof(null);
      setFailedFocus(null);
      if (actor && sameAchievementActor(actor)) void refetchFresh();
      return () => {
        scope.active = false;
        if (activeFocus.current === scope) activeFocus.current = null;
        if (actor) {
          void queryClient.cancelQueries({
            queryKey: ["achievements", "owner", actor.ownerId, actor.authEpoch],
            exact: true,
          });
        }
        setFocusProof(null);
        setFailedFocus(null);
      };
    }, [actor, actorKey, refetchFresh, queryClient]),
  );
  const focusReadFailed =
    !!actor && sameAchievementActor(actor) && failedFocus !== null &&
    failedFocus === activeFocus.current && failedFocus.actorKey === actorKey;
  const proven =
    !!actor &&
    sameAchievementActor(actor) &&
    focusProof === actorKey &&
    !achievementsPending &&
    !achievementsFetching &&
    !achievementsError;
  const status = proven ? achievementsRes?.kind : undefined;
  const data =
    status === "granted" && achievementsRes?.kind === "granted" ? achievementsRes.data : undefined;
  const achievements = data?.achievements;
  const { data: activeCourses = [] } = useQuery(
    achievementsCoursesForActor(actor, proven && status === "granted"),
  );

  const byCategory = useMemo(() => {
    if (!achievements) return {};
    return achievements.reduce<Record<string, AchievementWire[]>>((acc, a) => {
      if (!a?.category) return acc;
      if (!acc[a.category]) acc[a.category] = [];
      acc[a.category].push(a);
      return acc;
    }, {});
  }, [achievements]);

  const unlockedCount = achievements?.filter((a) => a.unlocked).length ?? 0;
  const totalCount = achievements?.length ?? 0;
  const completionPct = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;

  const onRefresh = () => {
    void refetchFresh();
  };

  if (!actor || !sameAchievementActor(actor)) {
    return (
      <TexturedSafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.centered}>
          <Text>Войдите в аккаунт, чтобы посмотреть достижения.</Text>
        </View>
      </TexturedSafeAreaView>
    );
  }

  if (!proven) {
    return (
      <TexturedSafeAreaView style={styles.container} edges={["top"]}>
        {focusReadFailed ? (
          <View style={styles.centered}>
            <Text variant="titleMedium" style={styles.errorTitle}>
              Не удалось загрузить достижения
            </Text>
            <Text variant="bodyMedium" style={styles.errorText}>
              Проверьте подключение и попробуйте снова.
            </Text>
            <Button mode="contained" onPress={onRefresh}>Повторить загрузку</Button>
          </View>
        ) : (
          <Loading message="Загрузка достижений..." />
        )}
      </TexturedSafeAreaView>
    );
  }

  if (status === "subscription_required") {
    return (
      <TexturedSafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.centered}>
          <Text variant="titleMedium" style={styles.errorTitle}>
            Достижения доступны по подписке
          </Text>
          <Text variant="bodyMedium" style={styles.errorText}>
            Подписка неактивна или срок её действия завершился.
          </Text>
          <Button
            mode="contained"
            onPress={() => {
              if (sameAchievementActor(actor))
                openAppSubscriptionPaywall({ reason: "required", contentMode: "subscription" });
            }}
          >
            Посмотреть подписку
          </Button>
          <Button onPress={onRefresh}>Проверить доступ снова</Button>
        </View>
      </TexturedSafeAreaView>
    );
  }

  if (status === "unauthorized" || status === "stale") {
    return (
      <TexturedSafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.centered}>
          <Text variant="titleMedium">Необходимо войти снова</Text>
          <Text variant="bodyMedium">Доступ к данным текущей сессии не подтверждён.</Text>
        </View>
      </TexturedSafeAreaView>
    );
  }

  if (status !== "granted") {
    return (
      <TexturedSafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.centered}>
          <Text variant="titleMedium" style={styles.errorTitle}>
            Не удалось проверить доступ к достижениям
          </Text>
          <Text variant="bodyMedium" style={styles.errorText}>
            Попробуйте повторить проверку подключения.
          </Text>
          <Button mode="contained" onPress={onRefresh}>
            Попробовать снова
          </Button>
        </View>
      </TexturedSafeAreaView>
    );
  }

  if (!data) {
    return (
      <TexturedSafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.centered}>
          <Text style={styles.noDataIcon}>📚</Text>
          <Text variant="titleMedium" style={styles.noDataTitle}>
            Данные не найдены
          </Text>
          <Text variant="bodyMedium" style={styles.noDataText}>
            Не удалось загрузить информацию о достижениях.
          </Text>
        </View>
      </TexturedSafeAreaView>
    );
  }

  return (
    <TexturedSafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={achievementsFetching} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text variant="headlineSmall" style={styles.title}>
            🏆 Достижения
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Ваш прогресс в обучении и достигнутые результаты
          </Text>
        </View>

        <View style={styles.statsSection}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            📊 Общая статистика
          </Text>
          <View style={styles.statsGrid}>
            <StatCard value={String(data.totalCourses ?? 0)} label="Всего курсов" icon="📚" />
            <StatCard value={String(data.completedCourses ?? 0)} label="Завершено" icon="✅" />
            <StatCard value={String(data.inProgressCourses ?? 0)} label="В процессе" icon="🔄" />
            <StatCard
              value={String(data.totalCompletedDays ?? 0)}
              label="Дней пройдено"
              icon="📅"
            />
          </View>
        </View>

        <View style={styles.achievementsSection}>
          <View style={styles.achievementsHeader}>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              🎯 Достижения
            </Text>
            <View style={styles.achievementsStats}>
              <Text variant="labelLarge" style={styles.achievementsCount}>
                {unlockedCount} из {totalCount}
              </Text>
              <Text variant="bodySmall" style={styles.achievementsPct}>
                ({completionPct}%)
              </Text>
            </View>
          </View>

          {Object.keys(byCategory).length === 0 ? (
            <View style={styles.noAchievements}>
              <Text style={styles.noAchievementsIcon}>🎯</Text>
              <Text variant="titleMedium" style={styles.noAchievementsTitle}>
                Пока нет достижений
              </Text>
              <Text variant="bodyMedium" style={styles.noAchievementsText}>
                Начните проходить курсы, чтобы получить первые достижения!
              </Text>
              <Button
                mode="contained"
                onPress={() => {
                  if (sameAchievementActor(actor)) router.push("/(main)/(tabs)");
                }}
                style={styles.coursesLink}
              >
                Перейти к курсам →
              </Button>
            </View>
          ) : (
            <View style={styles.categoriesContainer}>
              {Object.entries(byCategory).map(([category, items]) => (
                <View key={category} style={styles.category}>
                  <Text variant="titleSmall" style={styles.categoryTitle}>
                    {getCategoryTitle(category)} ({items.length})
                  </Text>
                  <View style={styles.achievementsList}>
                    {items.map((a) => (
                      <AchievementCard key={a.id} achievement={a} />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.coursesSection}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            📚 Детальная статистика по курсам
          </Text>
          <CoursesList
            courses={activeCourses}
            onCoursePress={(type) => {
              if (sameAchievementActor(actor))
                router.push(`/(main)/training/${encodeURIComponent(type)}`);
            }}
            onBrowsePress={() => {
              if (sameAchievementActor(actor)) router.push("/(main)/(tabs)");
            }}
          />
        </View>
      </ScrollView>
    </TexturedSafeAreaView>
  );
}

function StatCard({ value, label, icon }: { value: string; label: string; icon: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text variant="titleLarge" style={styles.statValue}>
        {value}
      </Text>
      <Text variant="bodySmall" style={styles.statLabel}>
        {label}
      </Text>
    </View>
  );
}

function AchievementCard({ achievement }: { achievement: AchievementWire }) {
  const unlocked = achievement.unlocked;
  return (
    <View style={[styles.achievementCard, !unlocked && styles.achievementLocked]}>
      <Text style={[styles.achievementIcon, !unlocked && styles.lockedIcon]}>
        {achievement.icon}
      </Text>
      <View style={styles.achievementContent}>
        <Text
          variant="titleSmall"
          style={[styles.achievementTitle, !unlocked && styles.lockedText]}
        >
          {achievement.title}
        </Text>
        <Text variant="bodySmall" style={[styles.achievementDesc, !unlocked && styles.lockedText]}>
          {achievement.description}
        </Text>
        <View style={styles.progressRow}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${achievement.progress}%` }]} />
          </View>
          <Text variant="labelSmall" style={styles.progressText}>
            {achievement.progress}%
          </Text>
        </View>
      </View>
    </View>
  );
}

function CoursesList({
  courses,
  onCoursePress,
  onBrowsePress,
}: {
  courses: CourseListItem[];
  onCoursePress: (type: string) => void;
  onBrowsePress: () => void;
}) {
  if (courses.length === 0) {
    return (
      <View style={styles.noCourses}>
        <Text style={styles.noCoursesIcon}>📚</Text>
        <Text variant="titleMedium" style={styles.noCoursesTitle}>
          Пока нет начатых курсов
        </Text>
        <Text variant="bodyMedium" style={styles.noCoursesText}>
          Начните изучение любого курса, чтобы увидеть статистику прогресса.
        </Text>
        <Button mode="contained" onPress={onBrowsePress} style={styles.coursesLink}>
          Выбрать курс
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.coursesList}>
      {courses.map((c) => (
        <Pressable key={c.id} style={styles.courseCard} onPress={() => onCoursePress(c.type)}>
          <Text variant="titleSmall" style={styles.courseName}>
            {c.name}
          </Text>
          <Text variant="bodySmall" style={styles.courseStatus}>
            {c.userStatus === "COMPLETED" && "✅ Завершён"}
            {(c.userStatus === "IN_PROGRESS" || c.userStatus === "PAUSED") && "🔄 В процессе"}
          </Text>
          <Text variant="labelMedium" style={styles.continueLink}>
            {c.userStatus === "COMPLETED" ? "Посмотреть курс" : "Продолжить обучение"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  header: {
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: "400",
    fontFamily: FONTS.impact,
    color: "#352E2E",
    textAlign: "center",
  },
  subtitle: {
    color: "#666",
    marginTop: SPACING.xs,
  },
  errorIcon: { fontSize: 48, marginBottom: SPACING.md },
  errorTitle: { marginBottom: SPACING.xs, color: COLORS.text },
  errorText: { color: COLORS.textSecondary, marginBottom: SPACING.md, textAlign: "center" },
  retryBtn: { marginTop: SPACING.sm },
  noDataIcon: { fontSize: 48, marginBottom: SPACING.md },
  noDataTitle: { marginBottom: SPACING.xs, color: COLORS.text },
  noDataText: { color: COLORS.textSecondary, textAlign: "center" },

  statsSection: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontWeight: "600",
    color: "#333",
    marginBottom: SPACING.md,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    justifyContent: "space-between",
  },
  statCard: {
    width: "48%",
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 8,
    padding: SPACING.md,
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  statIcon: { fontSize: 20, marginBottom: SPACING.xs },
  statValue: { fontWeight: "700", color: STAT_VALUE, marginBottom: 2 },
  statLabel: { color: "#666", fontWeight: "500", fontSize: 12 },

  achievementsSection: { marginBottom: SPACING.lg },
  achievementsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.md,
    flexWrap: "wrap",
    gap: SPACING.xs,
  },
  achievementsStats: { flexDirection: "row", alignItems: "center", gap: SPACING.xs },
  achievementsCount: { fontWeight: "600", color: "#333", fontSize: 14 },
  achievementsPct: { color: "#666", fontSize: 12 },

  noAchievements: {
    alignItems: "center",
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.md,
  },
  noAchievementsIcon: { fontSize: 48, marginBottom: SPACING.md },
  noAchievementsTitle: { marginBottom: SPACING.xs, color: "#333" },
  noAchievementsText: {
    color: "#666",
    marginBottom: SPACING.md,
    textAlign: "center",
  },
  coursesLink: { marginTop: SPACING.xs },

  categoriesContainer: { gap: SPACING.lg },
  category: {
    backgroundColor: CARD_BG,
    borderRadius: 8,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  categoryTitle: {
    fontWeight: "600",
    color: "#333",
    marginBottom: SPACING.md,
    fontSize: 16,
  },
  achievementsList: { gap: SPACING.sm },
  achievementCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: "transparent",
  },
  achievementLocked: {
    backgroundColor: LOCKED_BG,
    opacity: 0.7,
  },
  achievementIcon: { fontSize: 20, marginTop: 2 },
  lockedIcon: { opacity: 0.5 },
  achievementContent: { flex: 1 },
  achievementTitle: { fontWeight: "600", color: "#333", marginBottom: 2 },
  achievementDesc: { color: "#666", fontSize: 12, marginBottom: SPACING.sm, lineHeight: 18 },
  lockedText: { color: COLORS.disabled },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: "#e9ecef",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: CARD_BORDER,
    borderRadius: 3,
  },
  progressText: { fontSize: 11, color: "#666", minWidth: 32, fontWeight: "500" },

  coursesSection: { marginBottom: SPACING.lg },
  coursesList: { gap: SPACING.sm },
  courseCard: {
    backgroundColor: CARD_BG,
    borderRadius: 8,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  courseName: { fontWeight: "600", color: "#333", marginBottom: 4 },
  courseStatus: { color: "#666", marginBottom: SPACING.xs },
  continueLink: { color: STAT_VALUE, fontWeight: "500" },

  noCourses: {
    alignItems: "center",
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.md,
  },
  noCoursesIcon: { fontSize: 48, marginBottom: SPACING.md },
  noCoursesTitle: { marginBottom: SPACING.xs, color: "#333" },
  noCoursesText: {
    color: "#666",
    marginBottom: SPACING.md,
    textAlign: "center",
  },
});
