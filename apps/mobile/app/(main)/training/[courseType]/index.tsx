import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Share,
  ActivityIndicator,
} from "react-native";
import { Text, Surface, Snackbar } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { calculateDayStatus, getDayDisplayStatus } from "@gafus/core/utils/training";
import { WebView } from "react-native-webview";

import { Loading } from "@/shared/components/ui";
import { useTrainingDays } from "@/shared/hooks";
import { useOfflineStore, useStepStatesForCourse } from "@/shared/stores";
import { coursesApi, paymentsApi, type Course, type TrainingDay } from "@/shared/lib/api";
import { COLORS, SPACING, FONTS } from "@/constants";
import { DAY_TYPE_LABELS } from "@/shared/lib/training/dayTypes";
import { showLockedDayAlert, WEB_BASE } from "@/shared/lib/utils/alerts";
import { CourseDescription } from "@/features/training/components";
import { isPaymentSuccessReturnUrl } from "@/shared/lib/payments/returnUrl";

/**
 * Экран списка дней тренировок курса
 */
export default function TrainingDaysScreen() {
  const { courseType } = useLocalSearchParams<{ courseType: string }>();
  const router = useRouter();

  const { data, isLoading, error, refetch, isRefetching } = useTrainingDays(courseType);
  const courseData = data?.success && data.data ? data.data : undefined;
  const stepStates = useStepStatesForCourse(courseData?.courseId ?? "");
  const downloadStatus = useOfflineStore((s) => s.status);
  const downloadQueue = useOfflineStore((s) => s.downloadQueue);
  const downloaded = useOfflineStore((s) => s.downloaded);
  const startDownload = useOfflineStore((s) => s.startDownload);
  const cancelDownload = useOfflineStore((s) => s.cancelDownload);
  const removeFromQueue = useOfflineStore((s) => s.removeFromQueue);
  const removeDownload = useOfflineStore((s) => s.removeDownload);
  const isDownloaded = !!downloaded[courseType];
  const isDownloadingThis = downloadStatus.status === "downloading" && downloadStatus.courseType === courseType;
  const isInQueue = downloadQueue.includes(courseType);
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [isPaymentChecking, setIsPaymentChecking] = useState(false);
  const [courseForPay, setCourseForPay] = useState<Course | null>(null);
  const [isLoadingCourseForPay, setIsLoadingCourseForPay] = useState(false);
  const hasHandledPaymentReturnRef = useRef(false);

  const isAccessDenied =
    (data && "code" in data && data.code === "FORBIDDEN") ||
    error?.message?.includes("COURSE_ACCESS_DENIED") ||
    (data && "error" in data && typeof data.error === "string" && data.error.includes("доступа")) ||
    (!data?.success && data && "code" in data && data.code === "FORBIDDEN");

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const pollAccessAfterPayment = useCallback(async () => {
    setIsPaymentChecking(true);
    await refetch();
    const delays = [2000, 3000, 5000];
    for (const delayMs of delays) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const next = await refetch();
      if (next.data?.success) {
        setSnackbar({ visible: true, message: "Оплата подтверждена. Доступ открыт." });
        setIsPaymentChecking(false);
        return;
      }
    }

    setSnackbar({
      visible: true,
      message: "Оплата обрабатывается. Обновите экран через несколько секунд.",
    });
    setIsPaymentChecking(false);
  }, [refetch]);

  const handleCreatePayment = useCallback(async () => {
    if (isCreatingPayment) return;
    const courseId = courseForPay?.id;
    if (!courseId) {
      setSnackbar({ visible: true, message: "Данные курса не загружены. Обновите экран." });
      return;
    }
    setIsCreatingPayment(true);

    const response = await paymentsApi.createPayment({ courseId });
    if (!response.success || !response.data?.confirmationUrl) {
      const messageByCode: Record<string, string> = {
        RATE_LIMIT: "Слишком много попыток. Повторите через минуту.",
        NETWORK_ERROR: "Нет подключения к интернету.",
        CONFIG: "Платежи временно недоступны.",
        NOT_FOUND: "Курс не найден.",
      };
      const fallback = response.error ?? "Не удалось создать платёж";
      setSnackbar({
        visible: true,
        message: response.code ? (messageByCode[response.code] ?? fallback) : fallback,
      });
      setIsCreatingPayment(false);
      return;
    }

    hasHandledPaymentReturnRef.current = false;
    setPaymentUrl(response.data.confirmationUrl);
    setIsCreatingPayment(false);
  }, [courseForPay?.id, isCreatingPayment]);

  const handleClosePaymentWebView = useCallback(
    async (isReturnUrl: boolean) => {
      setPaymentUrl(null);
      if (isReturnUrl) {
        await pollAccessAfterPayment();
      } else {
        await refetch();
      }
    },
    [pollAccessAfterPayment, refetch],
  );

  const handlePaymentNavigation = useCallback(
    async (url?: string) => {
      if (!url || hasHandledPaymentReturnRef.current) return;
      const expectedHost = new URL(WEB_BASE).host;
      if (!isPaymentSuccessReturnUrl(url, expectedHost)) return;
      hasHandledPaymentReturnRef.current = true;
      await handleClosePaymentWebView(true);
    },
    [handleClosePaymentWebView],
  );

  useEffect(() => {
    if (__DEV__) {
      console.log("[TrainingDaysScreen] paywall load effect", {
        isAccessDenied,
        courseType,
        skip: !isAccessDenied || !!courseForPay,
      });
    }
    if (!isAccessDenied || courseForPay) return;

    let cancelled = false;
    setIsLoadingCourseForPay(true);

    (async () => {
      try {
        const coursesResponse = await coursesApi.getAll();
        if (__DEV__) {
          console.log("[TrainingDaysScreen] coursesApi.getAll()", {
            success: coursesResponse.success,
            error: "error" in coursesResponse ? coursesResponse.error : undefined,
            code: "code" in coursesResponse ? coursesResponse.code : undefined,
            count: coursesResponse.success && coursesResponse.data ? coursesResponse.data.length : 0,
          });
        }
        if (cancelled) return;

        if (coursesResponse.success && coursesResponse.data) {
          const typesFromApi = coursesResponse.data.map((c) => ({ type: c.type, id: c.id }));
          if (__DEV__) {
            console.log("[TrainingDaysScreen] course types from API", {
              lookingFor: courseType,
              typesFromApi,
            });
          }
          const course =
            coursesResponse.data.find((item) => item.type === courseType) ??
            coursesResponse.data.find((item) => item.id === courseType) ??
            null;
          if (__DEV__) {
            console.log("[TrainingDaysScreen] courseForPay resolved", {
              found: !!course,
              courseType,
              name: course?.name,
              hasDescription: !!course?.description,
              dayLinksCount: course?.dayLinks?.length ?? 0,
              priceRub: course?.priceRub,
            });
          }
          setCourseForPay(course);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingCourseForPay(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // isLoadingCourseForPay намеренно не в deps: иначе при setState(true) эффект перезапускается,
    // cleanup выставляет cancelled, и запрос завершается без setCourseForPay
  }, [courseForPay, courseType, isAccessDenied]);

  const handleDayPress = useCallback(
    (day: TrainingDay) => {
      if (day.isLocked) {
        showLockedDayAlert();
        return;
      }
      router.push(`/training/${courseType}/${day.dayOnCourseId}`);
    },
    [router, courseType],
  );

  const handleShareCourse = useCallback(async () => {
    const url = `https://gafus.ru/trainings/${courseType}`;
    const message = [courseType, courseData?.courseDescription, url].filter(Boolean).join("\n\n");
    try {
      await Share.share({
        title: `Курс: ${courseType}`,
        message,
        url,
      });
    } catch {
      await Clipboard.setStringAsync(url);
      setSnackbar({ visible: true, message: "Ссылка скопирована" });
    }
  }, [courseType, courseData?.courseDescription]);

  const renderDayItem = useCallback(
    ({ item, index }: { item: TrainingDay; index: number }) => {
      // Если нет courseId, все равно показываем дни (courseId может быть в courseData)
      if (!courseData) {
        if (__DEV__) {
          console.warn(
            "[TrainingDaysScreen] renderDayItem: courseData is undefined for index",
            index,
          );
        }
        return null;
      }

      const courseId = courseData.courseId;

      if (!courseId && __DEV__) {
        console.warn("[TrainingDaysScreen] courseId is missing in courseData", courseData);
      }

      // Вычисляем локальный статус дня из stepStore (как на web); RESET приоритетнее серверного COMPLETED
      const effectiveCourseId = courseId || courseType;
      const localStatus = calculateDayStatus(effectiveCourseId, item.dayOnCourseId, stepStates);
      const finalStatus = getDayDisplayStatus(localStatus, item.userStatus ?? undefined);

      const isCompleted = finalStatus === "COMPLETED";
      const isInProgress = finalStatus === "IN_PROGRESS";
      const isReset = finalStatus === "RESET";

      // Определяем цвет границы в зависимости от статуса (как на web)
      const borderColor = isCompleted
        ? "#B6C582" // Зеленый для завершенных (как на web)
        : isInProgress
          ? "#F6D86E" // Желтый для в процессе (как на web)
          : isReset
            ? "#b0aeae" // Серый для сброшенного (как на web)
            : "transparent";

      const isLocked = item.isLocked ?? false;

      return (
        <Pressable onPress={() => handleDayPress(item)}>
          <View style={[styles.dayCardWrapper, { borderColor }]}>
            {/* Бейджи времени (как на web) */}
            {((item.estimatedDuration || 0) > 0 || (item.theoryMinutes || 0) > 0) && (
              <View style={styles.timeBadgeWrapper}>
                {(item.estimatedDuration || 0) > 0 && (
                  <View style={styles.timeBadge}>
                    <Text style={styles.timeBadgeText}>{item.estimatedDuration}</Text>
                    <Text style={styles.timeBadgeLabel}>мин</Text>
                  </View>
                )}
                {(item.theoryMinutes || 0) > 0 && (
                  <View style={styles.timeBadgeTheory}>
                    <Text style={styles.timeBadgeTheoryText}>{item.theoryMinutes}</Text>
                    <Text style={styles.timeBadgeTheoryLabel}>мин</Text>
                  </View>
                )}
              </View>
            )}
            <Surface style={[styles.dayCard, isLocked && styles.dayCardLocked]} elevation={1}>
              {isLocked && (
                <View style={styles.lockBadge}>
                  <MaterialCommunityIcons name="lock" size={18} color="#8b8a3b" />
                  <Text style={styles.lockBadgeText}>Заблокировано</Text>
                </View>
              )}
              <Text style={styles.dayTitle}>{item.title}</Text>
              <Text style={styles.subtitle}>({DAY_TYPE_LABELS[item.type] ?? item.type})</Text>
              <Text style={styles.equipmentLabel}>Что понадобится:</Text>
              <Text style={styles.equipment}>{item.equipment || "вкусняшки и терпение"}</Text>
            </Surface>
          </View>
        </Pressable>
      );
    },
    [courseData, courseType, stepStates, handleDayPress],
  );

  if (isLoading) {
    return <Loading fullScreen message="Загрузка тренировок..." />;
  }

  if (isAccessDenied) {
    if (__DEV__) {
      console.log("[TrainingDaysScreen] paywall render", {
        isLoadingCourseForPay,
        hasCourseForPay: !!courseForPay,
        courseName: courseForPay?.name,
      });
    }
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <Pressable style={styles.backRow} onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={COLORS.primary} />
          <Text style={styles.backText}>Назад</Text>
        </Pressable>

        <ScrollView contentContainerStyle={styles.paywallScrollContent}>
          {/* Заголовок «Содержание» как на web */}
          <Text style={styles.paywallContentTitle}>Содержание</Text>

          {courseForPay?.description ? (
            <CourseDescription
              description={courseForPay.description}
              equipment={courseForPay.equipment ?? null}
              trainingLevel={courseForPay.trainingLevel}
              onShare={handleShareCourse}
              courseType={courseType}
            />
          ) : null}

          {courseForPay?.dayLinks?.length ? (
            <View style={styles.outlineSection}>
              <Text style={styles.outlineTitle}>В курс входит</Text>
              {courseForPay.dayLinks
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((item, index) => (
                  <View key={`${item.order}-${item.day.id}`} style={styles.outlineItemRow}>
                    <Text style={styles.outlineItemNumber}>{index + 1}.</Text>
                    <Text style={styles.outlineItem}>{item.day.title}</Text>
                  </View>
                ))}
            </View>
          ) : null}

          <View style={styles.paywallCard}>
            <Text style={styles.paywallTitle}>Курс платный</Text>
            {isLoadingCourseForPay && !courseForPay ? (
              <Text style={styles.paywallSubtitle}>Загрузка данных курса…</Text>
            ) : (
              <>
                <Text style={styles.paywallSubtitle}>
                  {courseForPay?.name
                    ? `Оплатите «${courseForPay.name}» для доступа к занятиям.`
                    : "Оплатите курс для доступа к занятиям."}
                  {courseForPay?.priceRub && courseForPay.priceRub > 0 ? (
                    <>
                      {" "}
                      Стоимость: {courseForPay.priceRub} ₽.
                    </>
                  ) : null}
                </Text>
                {!courseForPay && !isLoadingCourseForPay ? (
                  <Text style={styles.paywallHint}>
                    Войдите в аккаунт, чтобы увидеть описание и стоимость курса.
                  </Text>
                ) : (
                  <Text style={styles.paywallHint}>
                    После оплаты доступ к занятиям откроется автоматически в течение минуты.
                  </Text>
                )}
              </>
            )}
            <View style={styles.paywallButtons}>
              <Pressable
                onPress={() => {
                  void handleCreatePayment();
                }}
                disabled={isCreatingPayment || isLoadingCourseForPay}
                style={styles.paywallPrimaryButton}
              >
                <Text style={styles.paywallPrimaryButtonText}>
                  {isCreatingPayment ? "Переход к оплате..." : "Оплатить"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => router.replace("/(main)/(tabs)/courses" as const)}
                style={styles.paywallSecondaryButton}
              >
                <Text style={styles.paywallSecondaryButtonText}>Назад к курсам</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>

        <Snackbar
          visible={snackbar.visible}
          onDismiss={() => setSnackbar({ visible: false, message: "" })}
          duration={2000}
        >
          {snackbar.message}
        </Snackbar>
        {paymentUrl && (
          <View style={styles.webViewOverlay}>
            <View style={styles.webViewHeader}>
              <Pressable
                onPress={() => {
                  void handleClosePaymentWebView(false);
                }}
              >
                <Text style={styles.webViewCloseText}>Закрыть</Text>
              </Pressable>
              {isPaymentChecking && <ActivityIndicator color={COLORS.primary} />}
            </View>
            <WebView
              source={{ uri: paymentUrl }}
              onNavigationStateChange={(state) => {
                void handlePaymentNavigation(state.url);
              }}
              onLoadEnd={(event) => {
                void handlePaymentNavigation(event.nativeEvent.url);
              }}
              startInLoadingState={true}
            />
          </View>
        )}
      </SafeAreaView>
    );
  }

  if (error || !data?.success) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <MaterialCommunityIcons name="alert-circle" size={48} color={COLORS.error} />
          <Text style={styles.errorText}>Ошибка загрузки курса</Text>
          <Pressable onPress={() => refetch()}>
            <Text style={styles.retryText}>Попробовать снова</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <Pressable style={styles.backRow} onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={COLORS.primary} />
          <Text style={styles.backText}>Назад</Text>
        </Pressable>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={true}
        >
          {/* Офлайн: скачать / прогресс / очередь */}
          <Surface style={styles.offlineSection} elevation={0}>
            {isDownloaded ? (
              <View style={styles.offlineRow}>
                <MaterialCommunityIcons name="check-circle" size={22} color={COLORS.primary} />
                <Text style={styles.offlineLabel}>Скачано для офлайна</Text>
                <Pressable
                  onPress={() => removeDownload(courseType)}
                  style={styles.offlineButton}
                >
                  <Text style={styles.offlineButtonText}>Удалить</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={styles.offlineRow}>
                  <MaterialCommunityIcons name="download" size={22} color={COLORS.primary} />
                  <Text style={styles.offlineLabel}>Скачать для офлайна</Text>
                  {!isDownloadingThis && !isInQueue && (
                    <Pressable
                      onPress={() => startDownload(courseType)}
                      style={styles.offlineButton}
                    >
                      <Text style={styles.offlineButtonText}>Скачать</Text>
                    </Pressable>
                  )}
                  {isDownloadingThis && (
                    <Pressable onPress={() => cancelDownload()} style={styles.offlineButton}>
                      <Text style={styles.offlineButtonText}>Отменить</Text>
                    </Pressable>
                  )}
                  {isInQueue && (
                    <Pressable
                      onPress={() => removeFromQueue(courseType)}
                      style={styles.offlineButton}
                    >
                      <Text style={styles.offlineButtonText}>Убрать из очереди</Text>
                    </Pressable>
                  )}
                </View>
                {isDownloadingThis && downloadStatus.status === "downloading" && (
                  <View style={styles.progressRow}>
                    <Text style={styles.progressLabel}>
                      {downloadStatus.progress.label ?? `${downloadStatus.progress.current}/${downloadStatus.progress.total}`}
                    </Text>
                  </View>
                )}
                {downloadQueue.length > 0 && !isDownloadingThis && (
                  <Text style={styles.queueHint}>В очереди: {downloadQueue.length}</Text>
                )}
              </>
            )}
          </Surface>

          {/* Заголовок "Содержание" (как на web) */}
          <Text style={styles.contentTitle}>Содержание</Text>

          {/* Описание курса (сворачиваемое, как на web) */}
          {courseData?.courseDescription && (
            <CourseDescription
              description={courseData.courseDescription}
              equipment={courseData.courseEquipment}
              trainingLevel={courseData.courseTrainingLevel}
              onShare={handleShareCourse}
              courseType={courseType}
            />
          )}

          {/* Заголовок "План занятий:" (как на web) */}
          <Text style={styles.planTitle}>План занятий:</Text>

          {/* Список дней (как на web - все в одном ScrollView) */}
          {courseData?.trainingDays && courseData.trainingDays.length > 0 ? (
            <View style={styles.daysList}>
              {courseData.trainingDays.map((item, index) => (
                <View key={item.dayOnCourseId || item.id || `day-${index}`}>
                  {renderDayItem({ item, index })}
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {isLoading
                  ? "Загрузка дней тренировок..."
                  : courseData
                    ? "Нет дней тренировок"
                    : "Не удалось загрузить данные"}
              </Text>
              {__DEV__ && courseData && (
                <Text style={styles.debugText}>
                  Debug: courseId={courseData.courseId}, days={courseData.trainingDays?.length || 0}
                </Text>
              )}
            </View>
          )}
        </ScrollView>
        <Snackbar
          visible={snackbar.visible}
          onDismiss={() => setSnackbar({ visible: false, message: "" })}
          duration={2000}
        >
          {snackbar.message}
        </Snackbar>
        {paymentUrl && (
          <View style={styles.webViewOverlay}>
            <View style={styles.webViewHeader}>
              <Pressable
                onPress={() => {
                  void handleClosePaymentWebView(false);
                }}
              >
                <Text style={styles.webViewCloseText}>Закрыть</Text>
              </Pressable>
              {isPaymentChecking && <ActivityIndicator color={COLORS.primary} />}
            </View>
            <WebView
              source={{ uri: paymentUrl }}
              onNavigationStateChange={(state) => {
                void handlePaymentNavigation(state.url);
              }}
              onLoadEnd={(event) => {
                void handlePaymentNavigation(event.nativeEvent.url);
              }}
              startInLoadingState={true}
            />
          </View>
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: 4,
  },
  backText: {
    fontSize: 17,
    color: COLORS.primary,
    fontWeight: "500",
  },
  scrollContent: {
    paddingBottom: SPACING.xl,
    paddingHorizontal: 0,
    paddingTop: SPACING.md,
  },
  paywallScrollContent: {
    paddingBottom: SPACING.xl,
  },
  paywallContentTitle: {
    color: "#352e2e",
    fontFamily: FONTS.impact,
    fontWeight: "400",
    fontSize: 60,
    lineHeight: 60,
    textAlign: "center",
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    marginHorizontal: SPACING.md,
  },
  outlineSection: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 12,
    backgroundColor: COLORS.cardBackground,
  },
  outlineTitle: {
    fontSize: 20,
    color: "#352E2E",
    fontFamily: FONTS.impact,
    marginBottom: SPACING.sm,
  },
  outlineItemRow: {
    flexDirection: "row",
    marginBottom: 6,
    paddingLeft: 4,
  },
  outlineItemNumber: {
    fontSize: 14,
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
    marginRight: 6,
    minWidth: 20,
  },
  outlineItem: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
  },
  paywallCard: {
    marginTop: SPACING.md,
    marginHorizontal: SPACING.md,
    padding: SPACING.lg,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#636128",
    backgroundColor: "#FFF8E5",
  },
  paywallTitle: {
    fontSize: 32,
    lineHeight: 34,
    color: "#352E2E",
    fontFamily: FONTS.impact,
    marginBottom: SPACING.sm,
  },
  paywallSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
  },
  paywallHint: {
    marginTop: SPACING.sm,
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
  },
  paywallButtons: {
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  paywallPrimaryButton: {
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    alignItems: "center",
  },
  paywallPrimaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
    fontFamily: FONTS.montserratBold,
  },
  paywallSecondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingVertical: 12,
    alignItems: "center",
  },
  paywallSecondaryButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
  },
  offlineSection: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: 12,
    backgroundColor: COLORS.cardBackground,
  },
  offlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  offlineLabel: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
  },
  offlineButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  offlineButtonText: {
    fontSize: 15,
    color: COLORS.primary,
    fontWeight: "600",
  },
  progressRow: {
    marginTop: 6,
  },
  progressLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  queueHint: {
    marginTop: 4,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  contentTitle: {
    color: "#352e2e",
    fontFamily: FONTS.impact,
    fontWeight: "400",
    fontSize: 60,
    lineHeight: 60,
    textAlign: "center",
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  planTitle: {
    color: "#352E2E",
    fontFamily: FONTS.impact,
    fontWeight: "600",
    fontSize: 20,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  daysList: {
    paddingBottom: SPACING.md,
  },
  dayCardWrapper: {
    marginBottom: SPACING.md,
    marginHorizontal: SPACING.md,
    borderRadius: 12,
    borderWidth: 4, // Немного толще, чем на web (там 2px, но визуально кажется толще из-за структуры)
    position: "relative",
    backgroundColor: "#FFF8E5",
    minHeight: 120,
  },
  dayCard: {
    paddingVertical: Math.round(14 * 0.75),
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#FFF8E5",
    minHeight: 120,
  },
  dayCardLocked: {
    opacity: 0.8,
  },
  lockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  lockBadgeText: {
    fontSize: 14,
    color: "#8b8a3b",
    fontWeight: "600",
  },
  timeBadgeWrapper: {
    position: "absolute",
    top: -10,
    right: -10,
    zIndex: 2,
    flexDirection: "column",
    gap: 6,
    alignItems: "center",
  },
  timeBadge: {
    backgroundColor: "#636128",
    borderRadius: 50,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 50,
  },
  timeBadgeText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "bold",
  },
  timeBadgeLabel: {
    color: "#ffffff",
    fontSize: 12,
  },
  timeBadgeTheory: {
    backgroundColor: "#af6d34",
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  timeBadgeTheoryText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  timeBadgeTheoryLabel: {
    color: "#ffffff",
    fontSize: 12,
  },
  dayTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 4,
    color: "#352E2E",
    paddingRight: 60, // Место для бейджей времени
    fontFamily: FONTS.impact, // Impact как на web
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 8,
    fontFamily: FONTS.montserrat,
  },
  equipmentLabel: {
    fontSize: 14,
    color: "#352E2E",
    marginTop: 4,
    marginBottom: 2,
    fontFamily: FONTS.montserrat,
  },
  equipment: {
    fontSize: 14,
    color: "#888",
    fontStyle: "italic",
    fontFamily: FONTS.montserrat,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.xl,
  },
  errorText: {
    color: COLORS.error,
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
  },
  retryText: {
    color: COLORS.primary,
    fontWeight: "600",
  },
  webViewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.surface,
  },
  webViewHeader: {
    height: 52,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderLight,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  webViewCloseText: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
  },
  emptyContainer: {
    padding: SPACING.xxl,
    alignItems: "center",
  },
  emptyText: {
    color: COLORS.textSecondary,
  },
  debugText: {
    marginTop: SPACING.md,
    fontSize: 12,
    color: COLORS.textSecondary,
    fontFamily: "monospace",
  },
});
