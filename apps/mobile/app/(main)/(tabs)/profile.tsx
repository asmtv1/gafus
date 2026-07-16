import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Alert, Pressable, Linking } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useShallow } from "zustand/react/shallow";

import { Card } from "@/shared/components/ui";
import {
  appSubscriptionApi,
  formatAppSubscriptionPaymentMethod,
  getYookassaPrimaryCta,
  requestAppSubscriptionPaywall,
  useAppSubscriptionStatus,
} from "@/features/app-subscription";
import { useMobileOnboardingTourStore } from "@/features/onboarding-tour";
import { useAuthStore } from "@/shared/stores";
import { useVkLink } from "@/shared/hooks";
import { subscriptionsApi } from "@/shared/lib/api";
import {
  pushSubscriptionDeviceStatusQueryOptions,
  studentNotesQueryOptions,
  trainerPublicProfileQueryOptions,
  userProfileQueryOptions,
} from "@/shared/lib/api/profileTabQueries";
import { userApi } from "@/shared/lib/api/user";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { reportClientError, reportClientErrorAndWait } from "@/shared/lib/tracer";
import {
  canSendMobileTracerSelfTest,
  sendMobileTracerSelfTest,
} from "@/shared/lib/tracer/mobileTracerSelfTest";
import { getCurrentDeviceTokens, setupPushNotifications } from "@/shared/lib/utils/notifications";
import { COLORS, SPACING, FONTS } from "@/shared/config";
import { USER_EMAIL_MISSING_HINT } from "@gafus/types";
import { trackEvent } from "@/shared/lib/analytics";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const AVATAR_MAX_SIZE_MB = 5;

const WEB_BASE_URL = "https://gafus.ru";
const DOCUMENT_URLS = {
  policy: `${WEB_BASE_URL}/policy.html`,
  oferta: `${WEB_BASE_URL}/oferta.html`,
  personal: `${WEB_BASE_URL}/personal.html`,
  personalDistribution: `${WEB_BASE_URL}/personal-distribution.html`,
} as const;
const SUPPORT_TELEGRAM_URL = "https://t.me/gafus_support";
const GAFUS_TELEGRAM_URL = "https://t.me/gafusRu";

function formatMskDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })} МСК`;
}

function MobileAppSubscriptionCard() {
  const queryClient = useQueryClient();
  const [unlinkConfirmed, setUnlinkConfirmed] = useState(false);
  const { data: statusResponse, isLoading, refetch } = useAppSubscriptionStatus();
  const status = statusResponse?.data;
  const isActive = Boolean(status?.hasActiveSubscription);
  const inactiveCta = getYookassaPrimaryCta();
  const canUnlink =
    isActive &&
    status?.provider === "YOOKASSA" &&
    Boolean(status.hasSavedPaymentMethod) &&
    !status.cancelAtPeriodEnd;

  const cancelMutation = useMutation({
    mutationFn: () => appSubscriptionApi.cancelYookassa(),
    onSuccess: async (result) => {
      if (!result.success) {
        Alert.alert("Не удалось удалить способ оплаты", result.error ?? "Попробуйте позже.");
        return;
      }
      setUnlinkConfirmed(false);
      await queryClient.invalidateQueries({ queryKey: ["app-subscription"] });
      Alert.alert("Способ оплаты удалён", "Автопродление подписки отключено.");
    },
  });

  const handleUnlink = () => {
    if (!unlinkConfirmed) {
      Alert.alert("Подтвердите действие", "Поставьте чек-бокс, чтобы удалить способ оплаты.");
      return;
    }
    cancelMutation.mutate();
  };

  if (isLoading) {
    return (
      <View style={styles.subscriptionCard}>
        <Text style={styles.subscriptionTitle}>Подписка Gafus Premium</Text>
        <Text style={styles.subscriptionMuted}>Загружаем данные подписки...</Text>
      </View>
    );
  }

  if (!isActive) {
    return (
      <View style={styles.subscriptionCard}>
        <View style={styles.subscriptionHeader}>
          <Text style={styles.subscriptionTitle}>Подписка Gafus Premium</Text>
          <View style={[styles.subscriptionStatusBadge, styles.subscriptionStatusInactive]}>
            <Text style={styles.subscriptionStatusText}>Не активна</Text>
          </View>
        </View>
        <Text style={styles.subscriptionMuted}>
          Откройте курсы, тренировки, документы питомца и консультации с кинологом.
        </Text>
        <Pressable
          style={styles.subscriptionPrimaryButton}
          onPress={() => requestAppSubscriptionPaywall("required")}
        >
          <Text style={styles.subscriptionPrimaryButtonText}>{inactiveCta}</Text>
        </Pressable>
        {statusResponse && !statusResponse.success ? (
          <Pressable style={styles.subscriptionGhostButton} onPress={() => void refetch()}>
            <Text style={styles.subscriptionGhostButtonText}>Обновить статус</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const nextChargeLabel =
    status?.provider === "YOOKASSA" && status.hasSavedPaymentMethod && status.nextChargeAt
      ? formatMskDateTime(status.nextChargeAt)
      : status?.provider === "APPLE"
        ? "Управляется в App Store"
        : "Отключено";
  const paidLabel = status?.isTrial ? "Пробный период до" : "Оплачено";
  const paidValue = status?.isTrial
    ? formatMskDateTime(status.trialEndsAt)
    : formatMskDateTime(status?.paidAt);

  return (
    <View style={styles.subscriptionCard}>
      <View style={styles.subscriptionHeader}>
        <Text style={styles.subscriptionTitle}>Подписка Gafus Premium</Text>
        <View style={styles.subscriptionStatusBadge}>
          <Text style={styles.subscriptionStatusText}>Активна</Text>
        </View>
      </View>

      <View style={styles.subscriptionGrid}>
        <View style={styles.subscriptionInfoCell}>
          <Text style={styles.subscriptionLabel}>{paidLabel}</Text>
          <Text style={styles.subscriptionValue}>{paidValue}</Text>
        </View>
        <View style={styles.subscriptionInfoCell}>
          <Text style={styles.subscriptionLabel}>Доступ до</Text>
          <Text style={styles.subscriptionValue}>{formatMskDateTime(status?.activeUntil)}</Text>
        </View>
        <View style={styles.subscriptionInfoCell}>
          <Text style={styles.subscriptionLabel}>Следующее списание</Text>
          <Text style={styles.subscriptionValue}>{nextChargeLabel}</Text>
        </View>
      </View>

      <View style={styles.subscriptionInfoCell}>
        <Text style={styles.subscriptionLabel}>Способ оплаты</Text>
        <Text style={styles.subscriptionValue}>{formatAppSubscriptionPaymentMethod(status)}</Text>
      </View>

      {canUnlink ? (
        <>
          <View style={styles.subscriptionDivider} />
          <Pressable
            style={styles.subscriptionCheckRow}
            onPress={() => setUnlinkConfirmed((value) => !value)}
          >
            <View
              style={[
                styles.subscriptionCheckbox,
                unlinkConfirmed && styles.subscriptionCheckboxOn,
              ]}
            >
              {unlinkConfirmed ? (
                <MaterialCommunityIcons name="check" size={16} color="#ECE5D2" />
              ) : null}
            </View>
            <Text style={styles.subscriptionCheckText}>
              Подтверждаю отвязку способа оплаты и отключение автоплатежей по подписке.
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.subscriptionDangerButton,
              (!unlinkConfirmed || cancelMutation.isPending) && styles.subscriptionButtonDisabled,
            ]}
            onPress={handleUnlink}
            disabled={!unlinkConfirmed || cancelMutation.isPending}
          >
            <Text style={styles.subscriptionDangerButtonText}>
              {cancelMutation.isPending ? "Удаляем..." : "Удалить способ оплаты"}
            </Text>
          </Pressable>
        </>
      ) : (
        <Text style={styles.subscriptionMuted}>
          Автопродление включится после сохранения способа оплаты.
        </Text>
      )}
    </View>
  );
}

// Функция для получения возраста (только годы, для пользователя)
const getAge = (birthDate: string | null): number | null => {
  if (!birthDate) return null;
  try {
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  } catch {
    reportClientError(new Error("parse_birth_date"), {
      severity: "warning",
      issueKey: "ProfileScreen",
      keys: { operation: "parse_birth_date" },
    });
    return null;
  }
};

// Функция для склонения
const declOfNum = (n: number, forms: [string, string, string]) => {
  const cases = [2, 0, 1, 1, 1, 2];
  return forms[n % 100 > 4 && n % 100 < 20 ? 2 : cases[Math.min(n % 10, 5)]];
};

// Функция для получения метки роли
const getRoleLabel = (role?: string) => {
  switch (role) {
    case "ADMIN":
      return "Администратор";
    case "MODERATOR":
      return "Модератор";
    case "TRAINER":
      return "Кинолог";
    case "USER":
    default:
      return null;
  }
};

// Функция для получения цвета роли
const getRoleColor = (role?: string) => {
  switch (role) {
    case "ADMIN":
      return "#8B4513";
    case "MODERATOR":
      return "#636128";
    case "TRAINER":
      return "#352E2E";
    default:
      return "#636128";
  }
};

/**
 * Страница профиля пользователя (точный дизайн как в веб-версии)
 */
export default function ProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const startOnboardingTour = useMobileOnboardingTourStore((s) => s.startTour);
  const { user, logout, setUser } = useAuthStore(
    useShallow((s) => ({
      user: s.user,
      logout: s.logout,
      setUser: s.setUser,
    })),
  );

  // Загрузка данных профиля
  const { data: profileData } = useQuery(userProfileQueryOptions);

  /** После смены email на web стор мог остаться со старым user — подтягиваем GET /profile */
  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ["user-profile"] });
    }, [queryClient]),
  );

  const [osPermission, setOsPermission] = useState<"granted" | "denied" | "undetermined">(
    "undetermined",
  );

  const refreshOsPermission = useCallback(async () => {
    if (Constants.appOwnership === "expo") return;
    try {
      const Notifications = await import("expo-notifications");
      const { status } = await Notifications.getPermissionsAsync();
      setOsPermission(
        status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined",
      );
    } catch {
      // оставляем undetermined
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshOsPermission();
    }, [refreshOsPermission]),
  );

  useEffect(() => {
    if (!profileData?.success || !profileData.data) return;
    setUser(profileData.data);
  }, [profileData, setUser]);

  const {
    data: pushDeviceStatus,
    isPending: pushDeviceStatusPending,
    isError: pushDeviceStatusError,
  } = useQuery(pushSubscriptionDeviceStatusQueryOptions);

  const { data: studentNotesData } = useQuery({
    ...studentNotesQueryOptions,
    enabled: user?.role === "USER",
  });

  const { data: trainerProfileData } = useQuery({
    ...trainerPublicProfileQueryOptions(user?.username ?? ""),
    enabled: user?.role === "TRAINER" && !!user?.username,
  });

  // Загрузка аватара пользователя
  const avatarUploadMutation = useMutation({
    mutationFn: async ({
      uri,
      mimeType,
      fileName,
    }: {
      uri: string;
      mimeType: string;
      fileName: string;
    }) => userApi.uploadAvatar(uri, mimeType, fileName),
    onSuccess: (result) => {
      if (result.success && result.data?.avatarUrl) {
        // Сразу подставляем URL с CDN в кэш, чтобы аватар отобразился без ожидания refetch
        queryClient.setQueryData(
          ["user-profile"],
          (old: Awaited<ReturnType<typeof userApi.getProfile>> | undefined) => {
            if (!old?.data) return old;
            const url = result.data!.avatarUrl;
            return {
              ...old,
              data: {
                ...old.data,
                profile: {
                  ...(old.data.profile ?? {}),
                  avatarUrl: url,
                },
              },
            };
          },
        );
        queryClient.invalidateQueries({ queryKey: ["user-profile"] });
        hapticFeedback.success();
      } else if (!result.success) {
        Alert.alert("Ошибка", result.error ?? "Не удалось загрузить аватар");
      } else {
        hapticFeedback.success();
      }
    },
    onError: (error) => {
      Alert.alert("Ошибка", error instanceof Error ? error.message : "Не удалось загрузить аватар");
    },
  });

  const enablePushMutation = useMutation({
    mutationFn: async () => {
      const ok = await setupPushNotifications();
      return ok
        ? { success: true }
        : { success: false, error: "Не удалось включить push-уведомления" };
    },
    onSuccess: async (result) => {
      void refreshOsPermission();
      if (!result.success) {
        Alert.alert("Уведомления", result.error ?? "Не удалось включить уведомления");
        return;
      }
      try {
        await queryClient.invalidateQueries({ queryKey: ["push-subscription-device-status"] });
        hapticFeedback.success();
      } catch (err) {
        reportClientError(err, {
          issueKey: "ProfileScreen",
          keys: { operation: "push_enable_invalidate" },
        });
        Alert.alert("Уведомления", "Не удалось обновить статус подписки");
      }
    },
  });

  const disablePushMutation = useMutation({
    mutationFn: async () => {
      const tokens = await getCurrentDeviceTokens();
      const endpoints = [tokens.expo, tokens.rustore].filter(Boolean) as string[];
      if (endpoints.length === 0) {
        return {
          success: false,
          error:
            "Не удалось определить это устройство. Разрешите уведомления в настройках телефона и повторите попытку.",
        };
      }
      const results = await Promise.all(
        endpoints.map((ep) => subscriptionsApi.deletePushSubscription(ep)),
      );
      return results.find((r) => !r.success) ?? { success: true };
    },
    onSuccess: async (result) => {
      if (!result.success) {
        Alert.alert("Уведомления", result.error ?? "Не удалось отключить уведомления");
        return;
      }
      try {
        await queryClient.invalidateQueries({ queryKey: ["push-subscription-device-status"] });
        hapticFeedback.success();
      } catch (err) {
        reportClientError(err, {
          issueKey: "ProfileScreen",
          keys: { operation: "push_disable_invalidate" },
        });
        Alert.alert("Уведомления", "Не удалось обновить статус подписки");
      }
    },
  });

  const profileUser = profileData?.data;
  const profile = profileUser?.profile;
  const cachedFullName = user?.profile?.fullName?.trim() || null;
  const currentFullName = profile?.fullName?.trim() || null;
  const cachedAvatarUrl = user?.profile?.avatarUrl?.trim() || null;
  const displayEmail = profileUser?.email?.trim() || user?.email?.trim() || "";
  const hasAppPassword = profileData?.data?.hasAppPassword ?? user?.hasAppPassword ?? false;
  const hasVkLinked = profileData?.data?.hasVkLinked ?? false;

  const { handleVkLink, isVkLinkLoading } = useVkLink({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      Alert.alert("Готово", "VK успешно подключён");
    },
    onError: (msg) => Alert.alert("Ошибка", msg),
  });
  const avatarUrl = profile?.avatarUrl?.trim() || cachedAvatarUrl;
  const greetingName = currentFullName || cachedFullName || user?.username || "пользователь";
  const avatarCacheKey = avatarUrl
    ? `user-avatar-${profileUser?.id ?? user?.id ?? "me"}-${avatarUrl}`
    : "user-avatar-placeholder";
  const displayRole = getRoleLabel(user?.role);
  const pushServerDetermined = pushDeviceStatus?.determined === true;
  const hasThisDevicePushOnServer = pushDeviceStatus?.hasThisDeviceSubscription === true;
  const studentNotes = studentNotesData?.success ? (studentNotesData.data ?? []) : [];
  const trainerCourses = trainerProfileData?.data?.courses ?? [];
  const canShowTracerSelfTest = canSendMobileTracerSelfTest(user);
  const [tracerSelfTestPending, setTracerSelfTestPending] = useState(false);

  const roleColor = getRoleColor(user?.role);

  const trackProfileClick = useCallback((elementId: string) => {
    trackEvent({
      eventName: "button_click",
      platform: "mobile",
      pathOrScreen: "/profile",
      elementId,
    });
  }, []);

  const handleLogout = () => {
    Alert.alert("Выход из аккаунта", "Вы уверены, что хотите выйти?", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Выйти",
        style: "destructive",
        onPress: async () => {
          try {
            await logout();
          } catch (err) {
            reportClientError(err, {
              issueKey: "ProfileScreen",
              keys: { operation: "logout" },
            });
            Alert.alert("Ошибка", "Не удалось выйти из аккаунта");
          }
        },
      },
    ]);
  };

  const handleRepeatOnboardingTour = () => {
    trackProfileClick("mobile-onboarding-repeat");
    startOnboardingTour();
  };

  const handleTracerSelfTest = async () => {
    if (tracerSelfTestPending) return;
    trackProfileClick("mobile-tracer-self-test");
    setTracerSelfTestPending(true);
    /* eslint-disable @gafus/require-client-catch-tracer -- AppTracer self-test failures cannot be reported through AppTracer without recursion */
    try {
      await sendMobileTracerSelfTest(reportClientErrorAndWait);
      Alert.alert("AppTracer", "Тестовая JS-ошибка принята AppTracer.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Неизвестная ошибка отправки";
      Alert.alert("AppTracer", `Не удалось отправить тестовую ошибку: ${message}`);
    } finally {
      setTracerSelfTestPending(false);
    }
    /* eslint-enable @gafus/require-client-catch-tracer */
  };

  const age = profile?.birthDate ? getAge(profile.birthDate) : null;
  const hasSocialLinks = profile?.instagram || profile?.telegram || profile?.website;

  const pickImageAndUploadAvatar = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Доступ", "Нужен доступ к фото для смены аватара");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? "image/jpeg";
      if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
        Alert.alert("Ошибка", "Разрешены только JPEG, PNG, WebP, GIF");
        return;
      }
      const sizeMB = (asset.fileSize ?? 0) / (1024 * 1024);
      if (sizeMB > AVATAR_MAX_SIZE_MB) {
        Alert.alert("Ошибка", `Максимальный размер аватара — ${AVATAR_MAX_SIZE_MB} МБ`);
        return;
      }
      const fileName = asset.uri.split("/").pop() ?? "photo.jpg";
      avatarUploadMutation.mutate({ uri: asset.uri, mimeType, fileName });
    } catch (err) {
      reportClientError(err, {
        issueKey: "ProfileScreen",
        keys: { operation: "pick_avatar" },
      });
      Alert.alert("Ошибка", "Не удалось выбрать фото");
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Заголовок */}
        <Text style={styles.title}>Профиль {user?.username}</Text>

        {/* Баннер профиля (оливковый фон) */}
        <View style={styles.profileBanner}>
          <Pressable
            style={styles.avatarContainer}
            onPress={pickImageAndUploadAvatar}
            disabled={avatarUploadMutation.isPending}
          >
            <View style={styles.avatarWrapper}>
              <Image
                source={
                  avatarUrl
                    ? { uri: avatarUrl, cacheKey: avatarCacheKey }
                    : require("../../../assets/images/avatar.png")
                }
                style={styles.avatarImage}
                contentFit="cover"
                recyclingKey={avatarCacheKey}
                transition={0}
              />
            </View>
            <View style={styles.avatarEditBadge}>
              <Text style={styles.avatarEditText}>✏️</Text>
            </View>
          </Pressable>
          <View style={styles.profileInfo}>
            <Text style={styles.greeting}>Привет, {greetingName}!</Text>
            <Text style={[styles.contactInfo, !displayEmail ? styles.contactInfoMissing : null]}>
              {displayEmail || USER_EMAIL_MISSING_HINT}
            </Text>
            {displayRole && (
              <View style={[styles.roleBadge, { backgroundColor: roleColor }]}>
                <Text style={styles.roleText}>{displayRole}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Контейнер с информацией о себе */}
        <View style={styles.infoContainer}>
          {age !== null && (
            <Text style={styles.infoText}>
              Возраст: {age} {declOfNum(age, ["год", "года", "лет"])}
            </Text>
          )}

          {/* О себе */}
          {(profile?.about || !age) && (
            <View style={styles.aboutContainer}>
              <Text style={styles.aboutTitle}>О СЕБЕ</Text>
              {profile?.about ? (
                <View style={styles.aboutCard}>
                  <Text style={styles.aboutText}>{profile.about}</Text>
                </View>
              ) : (
                <Text style={styles.emptyNotice}>Информация о себе не внесена</Text>
              )}
            </View>
          )}

          {/* Социальные сети */}
          {hasSocialLinks && (
            <View style={styles.socialLinksContainer}>
              <Text style={styles.socialLinksTitle}>КОНТАКТЫ</Text>
              <View style={styles.socialLinksList}>
                {profile?.instagram && (
                  <Pressable
                    style={styles.socialLink}
                    onPress={() => Linking.openURL(`https://instagram.com/${profile.instagram}`)}
                  >
                    <Text style={styles.socialIcon}>📷</Text>
                    <Text style={styles.socialLabel}>Instagram</Text>
                    <Text style={styles.socialUsername}>{profile.instagram}</Text>
                  </Pressable>
                )}
                {profile?.telegram && (
                  <Pressable
                    style={styles.socialLink}
                    onPress={() => Linking.openURL(`https://t.me/${profile.telegram}`)}
                  >
                    <Text style={styles.socialIcon}>✈️</Text>
                    <Text style={styles.socialLabel}>Telegram</Text>
                    <Text style={styles.socialUsername}>{profile.telegram}</Text>
                  </Pressable>
                )}
                {profile?.website && (
                  <Pressable
                    style={styles.socialLink}
                    onPress={() => Linking.openURL(profile.website!)}
                  >
                    <Text style={styles.socialIcon}>🌐</Text>
                    <Text style={styles.socialLabel}>Сайт</Text>
                    <Text style={styles.socialUsername}>{profile.website}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}

          <Pressable
            style={styles.editBioButton}
            onPress={() => {
              trackProfileClick("profile-edit-open");
              router.push({ pathname: "/profile/edit" });
            }}
          >
            <Text style={styles.editBioButtonText}>Внести/Изменить «О себе»</Text>
          </Pressable>

          <View style={styles.notificationsCard}>
            <Text style={styles.notificationsTitle}>Уведомления</Text>

            <View style={styles.notifyStatusRow}>
              <Text style={styles.notifyStatusLabel}>Разрешение телефона:</Text>
              <View
                style={[
                  styles.notifyStatusBadge,
                  osPermission === "granted"
                    ? styles.notifyBadgeOk
                    : osPermission === "denied"
                      ? styles.notifyBadgeFail
                      : styles.notifyBadgeWarn,
                ]}
              >
                <Text style={styles.notifyBadgeText}>
                  {osPermission === "granted"
                    ? "✅ Разрешено"
                    : osPermission === "denied"
                      ? "❌ Запрещено"
                      : "⏳ Не запрошено"}
                </Text>
              </View>
            </View>

            <View style={styles.notifyStatusRow}>
              <Text style={styles.notifyStatusLabel}>Подписка на этом устройстве:</Text>
              <View
                style={[
                  styles.notifyStatusBadge,
                  pushDeviceStatusPending
                    ? styles.notifyBadgeWarn
                    : pushDeviceStatusError
                      ? styles.notifyBadgeFail
                      : !pushServerDetermined
                        ? styles.notifyBadgeWarn
                        : hasThisDevicePushOnServer
                          ? styles.notifyBadgeOk
                          : styles.notifyBadgeFail,
                ]}
              >
                <Text style={styles.notifyBadgeText}>
                  {pushDeviceStatusPending
                    ? "⏳ Проверка…"
                    : pushDeviceStatusError
                      ? "❌ Ошибка"
                      : !pushServerDetermined
                        ? "⚠️ Нет токена"
                        : hasThisDevicePushOnServer
                          ? "✅ Активна"
                          : "❌ Неактивна"}
                </Text>
              </View>
            </View>

            {!pushDeviceStatusPending && !pushDeviceStatusError && !pushServerDetermined && (
              <Text style={styles.notifyHintText}>
                Разрешите уведомления, чтобы проверить и включить подписку на этом устройстве.
              </Text>
            )}

            {osPermission === "denied" && pushServerDetermined && hasThisDevicePushOnServer && (
              <View style={styles.notifyWarningBox}>
                <MaterialCommunityIcons name="alert" size={14} color="#8B4513" />
                <Text style={styles.notifyWarningText}>
                  Сервер пытается отправлять пуши, но телефон их блокирует. Разрешите уведомления в
                  настройках телефона.
                </Text>
              </View>
            )}

            <View style={styles.notificationsActions}>
              {osPermission === "denied" ? (
                <Pressable
                  style={[styles.notifyActionButton, styles.notifyActionSettings]}
                  onPress={() => void Linking.openSettings()}
                >
                  <MaterialCommunityIcons name="cog-outline" size={15} color="#ECE5D2" />
                  <Text style={styles.notifyActionText}>Открыть настройки телефона</Text>
                </Pressable>
              ) : osPermission === "undetermined" ? (
                <Pressable
                  style={styles.notifyActionButton}
                  disabled={enablePushMutation.isPending}
                  onPress={() => enablePushMutation.mutate()}
                >
                  <Text style={styles.notifyActionText}>
                    {enablePushMutation.isPending ? "Загрузка..." : "Включить уведомления"}
                  </Text>
                </Pressable>
              ) : pushServerDetermined && hasThisDevicePushOnServer ? (
                <Pressable
                  style={[styles.notifyActionButton, styles.notifyActionDanger]}
                  disabled={disablePushMutation.isPending}
                  onPress={() => disablePushMutation.mutate()}
                >
                  <Text style={styles.notifyActionText}>
                    {disablePushMutation.isPending ? "Загрузка..." : "Отключить уведомления"}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  style={styles.notifyActionButton}
                  disabled={enablePushMutation.isPending}
                  onPress={() => enablePushMutation.mutate()}
                >
                  <Text style={styles.notifyActionText}>
                    {enablePushMutation.isPending ? "Загрузка..." : "Включить подписку"}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          <Pressable
            style={styles.remindersCard}
            onPress={() => {
              trackProfileClick("training-reminders-open");
              router.push({ pathname: "/reminders" });
            }}
          >
            <MaterialCommunityIcons name="bell-ring-outline" size={22} color={COLORS.primary} />
            <View style={styles.remindersCardContent}>
              <Text style={styles.remindersCardTitle}>Напоминания о тренировках</Text>
              <Text style={styles.remindersCardSubtitle}>Настроить время и дни</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.primary} />
          </Pressable>

          <MobileAppSubscriptionCard />

          <Pressable style={styles.remindersCard} onPress={handleRepeatOnboardingTour}>
            <MaterialCommunityIcons name="map-search-outline" size={22} color={COLORS.primary} />
            <View style={styles.remindersCardContent}>
              <Text style={styles.remindersCardTitle}>Повторить экскурсию</Text>
              <Text style={styles.remindersCardSubtitle}>Коротко показать основные разделы</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.primary} />
          </Pressable>

          {canShowTracerSelfTest ? (
            <Pressable
              style={styles.remindersCard}
              onPress={handleTracerSelfTest}
              disabled={tracerSelfTestPending}
            >
              <MaterialCommunityIcons name="bug-check-outline" size={22} color={COLORS.primary} />
              <View style={styles.remindersCardContent}>
                <Text style={styles.remindersCardTitle}>Проверить AppTracer</Text>
                <Text style={styles.remindersCardSubtitle}>
                  {tracerSelfTestPending ? "Отправка…" : "Отправить тестовую JS-ошибку"}
                </Text>
              </View>
              <MaterialCommunityIcons name="send-outline" size={20} color={COLORS.primary} />
            </Pressable>
          ) : null}

          {user?.role === "USER" && (
            <View style={styles.notesCard}>
              <Text style={styles.notesTitle}>Заметки тренера</Text>
              {studentNotes.length === 0 ? (
                <Text style={styles.notesEmpty}>Пока нет заметок от тренера</Text>
              ) : (
                studentNotes.map((note) => (
                  <View key={note.id} style={styles.noteItem}>
                    <Text style={styles.noteTitle}>{note.title}</Text>
                    <Text style={styles.noteMeta}>
                      {note.trainer?.profile?.fullName ?? "Тренер"} •{" "}
                      {new Date(note.createdAt).toLocaleDateString("ru-RU")}
                    </Text>
                    {note.entries.map((entry) => (
                      <Text key={entry.id} style={styles.noteContent}>
                        • {entry.content}
                      </Text>
                    ))}
                  </View>
                ))
              )}
            </View>
          )}

          {user?.role === "TRAINER" && (
            <View style={styles.notesCard}>
              <Text style={styles.notesTitle}>Курсы кинолога</Text>
              {trainerCourses.length === 0 ? (
                <Text style={styles.notesEmpty}>Курсы не найдены</Text>
              ) : (
                trainerCourses.map((course) => (
                  <Pressable
                    key={course.id}
                    style={styles.trainerCourseItem}
                    onPress={() => router.push(`/training/${course.type}`)}
                  >
                    <Text style={styles.trainerCourseTitle}>{course.name}</Text>
                    <Text style={styles.trainerCourseMeta}>{course.shortDesc}</Text>
                  </Pressable>
                ))
              )}
            </View>
          )}
        </View>

        {!hasVkLinked ? (
          <Pressable
            style={({ pressed }) => [
              styles.passwordButton,
              pressed && { opacity: 0.7 },
              isVkLinkLoading && { opacity: 0.5 },
            ]}
            onPress={handleVkLink}
            disabled={isVkLinkLoading}
          >
            <Text style={styles.passwordButtonText}>
              {isVkLinkLoading ? "Подключение..." : "🔗 Подключить VK"}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.vkLinkedBadge}>
            <MaterialCommunityIcons name="check-circle" size={22} color={COLORS.success} />
            <Text style={styles.vkLinkedBadgeText}>VK подключён</Text>
          </View>
        )}

        {hasAppPassword ? (
          <Pressable
            style={styles.passwordButton}
            onPress={() => router.push("/profile/change-password" as Href)}
          >
            <Text style={styles.passwordButtonText}>🔐 Сменить пароль</Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.passwordButton}
            onPress={() => router.push("/profile/set-password")}
          >
            <Text style={styles.passwordButtonText}>🔐 Установить пароль</Text>
          </Pressable>
        )}

        <Pressable
          style={styles.passwordButton}
          onPress={() => router.push("/profile/change-email" as Href)}
        >
          <Text style={styles.passwordButtonText}>✉️ Сменить email</Text>
        </Pressable>

        <Pressable
          style={styles.passwordButton}
          onPress={() => router.push({ pathname: "/profile/change-username" })}
        >
          <Text style={styles.passwordButtonText}>👤 Сменить логин</Text>
        </Pressable>

        <Pressable
          style={styles.deleteAccountButton}
          onPress={() => router.push("/profile/delete-account")}
        >
          <Text style={styles.deleteAccountButtonText}>Удалить аккаунт</Text>
        </Pressable>

        {/* Выход */}
        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Выйти из аккаунта</Text>
        </Pressable>

        {/* Информация (в самом низу) */}
        <Card style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>Информация</Text>

          <View style={styles.infoItem}>
            <Text style={styles.infoIcon}>ℹ️</Text>
            <View style={styles.infoContent}>
              <Text style={styles.infoItemTitle}>О приложении</Text>
              <Text style={styles.infoItemDesc}>Версия {Constants.expoConfig?.version ?? "—"}</Text>
            </View>
          </View>

          <View style={styles.infoDivider} />

          <Pressable style={styles.infoItem} onPress={() => Linking.openURL(GAFUS_TELEGRAM_URL)}>
            <Text style={styles.infoIcon}>📢</Text>
            <View style={styles.infoContent}>
              <Text style={styles.infoItemTitle}>Наш Telegram</Text>
            </View>
            <Text style={styles.infoArrow}>→</Text>
          </Pressable>

          <View style={styles.infoDivider} />

          <Pressable style={styles.infoItem} onPress={() => Linking.openURL(DOCUMENT_URLS.policy)}>
            <Text style={styles.infoIcon}>🔒</Text>
            <View style={styles.infoContent}>
              <Text style={styles.infoItemTitle}>Политика конфиденциальности</Text>
            </View>
            <Text style={styles.infoArrow}>→</Text>
          </Pressable>

          <View style={styles.infoDivider} />

          <Pressable style={styles.infoItem} onPress={() => Linking.openURL(DOCUMENT_URLS.oferta)}>
            <Text style={styles.infoIcon}>📄</Text>
            <View style={styles.infoContent}>
              <Text style={styles.infoItemTitle}>Оферта</Text>
            </View>
            <Text style={styles.infoArrow}>→</Text>
          </Pressable>

          <View style={styles.infoDivider} />

          <Pressable
            style={styles.infoItem}
            onPress={() => Linking.openURL(DOCUMENT_URLS.personal)}
          >
            <Text style={styles.infoIcon}>📋</Text>
            <View style={styles.infoContent}>
              <Text style={styles.infoItemTitle}>Согласие на обработку персональных данных</Text>
            </View>
            <Text style={styles.infoArrow}>→</Text>
          </Pressable>

          <View style={styles.infoDivider} />

          <Pressable
            style={styles.infoItem}
            onPress={() => Linking.openURL(DOCUMENT_URLS.personalDistribution)}
          >
            <Text style={styles.infoIcon}>📋</Text>
            <View style={styles.infoContent}>
              <Text style={styles.infoItemTitle}>Согласие на распространение данных</Text>
            </View>
            <Text style={styles.infoArrow}>→</Text>
          </Pressable>

          <View style={styles.infoDivider} />

          <Pressable style={styles.infoItem} onPress={() => Linking.openURL(SUPPORT_TELEGRAM_URL)}>
            <Text style={styles.infoIcon}>💬</Text>
            <View style={styles.infoContent}>
              <Text style={styles.infoItemTitle}>Связаться с поддержкой</Text>
            </View>
            <Text style={styles.infoArrow}>→</Text>
          </Pressable>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: SPACING.md,
  },
  title: {
    fontSize: 28,
    fontWeight: "400",
    color: "#352E2E",
    textAlign: "center",
    marginBottom: SPACING.md,
    fontFamily: FONTS.impact,
  },
  // Баннер профиля (оливковый фон)
  profileBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    width: "100%",
    backgroundColor: "#636128",
    borderRadius: 12,
    paddingVertical: SPACING.sm + 10,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  avatarContainer: {
    position: "relative",
    width: 105,
    height: 105,
    flexShrink: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarWrapper: {
    width: 95,
    height: 95,
    borderRadius: 48,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
    backgroundColor: COLORS.primary,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarEditBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 14,
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarEditText: {
    fontSize: 14,
  },
  profileInfo: {
    flex: 1,
    flexDirection: "column",
    gap: 4,
  },
  greeting: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ECE5D2",
    fontFamily: FONTS.impact,
    lineHeight: 20,
  },
  contactInfo: {
    fontSize: 13,
    color: "#D4C4A8",
    fontFamily: FONTS.montserrat,
    opacity: 0.9,
  },
  contactInfoMissing: {
    fontStyle: "italic",
    opacity: 0.85,
  },
  roleBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginTop: 4,
    alignSelf: "flex-start",
  },
  roleText: {
    color: "#ECE5D2",
    fontSize: 12,
    fontWeight: "600",
    fontFamily: FONTS.impact,
  },
  // Контейнер с информацией о себе
  infoContainer: {
    width: "100%",
    padding: SPACING.md,
    backgroundColor: "#F5F0E8",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    marginBottom: SPACING.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  infoText: {
    fontSize: 14,
    color: "#352E2E",
    marginBottom: SPACING.sm,
    padding: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: "#ECE5D2",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    fontFamily: FONTS.montserrat,
  },
  emptyNotice: {
    backgroundColor: "#FFF8E5",
    color: "#636128",
    padding: SPACING.md,
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#D4C4A8",
    textAlign: "center",
    fontStyle: "italic",
    marginBottom: SPACING.sm,
    fontSize: 14,
    fontFamily: FONTS.montserrat,
  },
  editBioButton: {
    backgroundColor: "#636128",
    minHeight: 48,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: SPACING.sm,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#636128",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  editBioButtonText: {
    color: "#ECE5D2",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    textAlign: "center",
    fontFamily: FONTS.impact,
  },
  notificationsCard: {
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    borderRadius: 12,
    backgroundColor: "#ECE5D2",
  },
  notificationsTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#352E2E",
    fontFamily: FONTS.impact,
    marginBottom: SPACING.sm,
  },
  notificationsStatus: {
    marginTop: 6,
    color: "#636128",
    fontFamily: FONTS.montserrat,
  },
  notifyStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  notifyStatusLabel: {
    fontFamily: FONTS.montserrat,
    fontSize: 13,
    fontWeight: "600",
    color: "#352E2E",
    flex: 1,
  },
  notifyStatusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  notifyBadgeOk: {
    backgroundColor: "#D4EDDA",
  },
  notifyBadgeFail: {
    backgroundColor: "#F8D7DA",
  },
  notifyBadgeWarn: {
    backgroundColor: "#FFF3CD",
  },
  notifyBadgeText: {
    fontSize: 12,
    fontFamily: FONTS.montserrat,
    fontWeight: "600",
    color: "#352E2E",
  },
  notifyWarningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "#FFF3CD",
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  notifyWarningText: {
    flex: 1,
    fontSize: 12,
    fontFamily: FONTS.montserrat,
    color: "#8B4513",
    lineHeight: 17,
  },
  notifyHintText: {
    fontSize: 12,
    fontFamily: FONTS.montserrat,
    color: "#6B6560",
    lineHeight: 17,
    marginBottom: 6,
  },
  notificationsActions: {
    marginTop: SPACING.sm,
    flexDirection: "row",
    gap: SPACING.sm,
  },
  notifyActionButton: {
    flex: 1,
    backgroundColor: "#636128",
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  notifyActionDanger: {
    backgroundColor: "#8B4513",
  },
  notifyActionSettings: {
    backgroundColor: "#352E2E",
  },
  notifyActionText: {
    color: "#ECE5D2",
    fontFamily: FONTS.impact,
    fontSize: 14,
    lineHeight: 18,
  },
  remindersCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    borderRadius: 12,
    backgroundColor: "#ECE5D2",
  },
  remindersCardContent: {
    flex: 1,
  },
  remindersCardTitle: {
    fontFamily: FONTS.impact,
    fontSize: 14,
    color: COLORS.text,
  },
  remindersCardSubtitle: {
    fontFamily: FONTS.montserrat,
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  subscriptionCard: {
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderWidth: 1.5,
    borderColor: "#A9A77A",
    borderRadius: 18,
    backgroundColor: "#F6F0DF",
    gap: SPACING.sm,
  },
  subscriptionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  subscriptionTitle: {
    flex: 1,
    fontFamily: FONTS.impact,
    fontSize: 20,
    lineHeight: 24,
    color: "#352E2E",
  },
  subscriptionStatusBadge: {
    borderRadius: 999,
    backgroundColor: "#DDE8CE",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  subscriptionStatusInactive: {
    backgroundColor: "#E7D7CB",
  },
  subscriptionStatusText: {
    fontFamily: FONTS.impact,
    fontSize: 13,
    color: COLORS.primary,
  },
  subscriptionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  subscriptionInfoCell: {
    flex: 1,
    minWidth: "45%",
    gap: 4,
  },
  subscriptionLabel: {
    fontFamily: FONTS.montserrat,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  subscriptionValue: {
    fontFamily: FONTS.impact,
    fontSize: 16,
    lineHeight: 21,
    color: "#352E2E",
  },
  subscriptionMuted: {
    fontFamily: FONTS.montserrat,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
  },
  subscriptionDivider: {
    height: 1,
    backgroundColor: "#D4C4A8",
    marginTop: 2,
  },
  subscriptionCheckRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  subscriptionCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#8D8A63",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF9EA",
  },
  subscriptionCheckboxOn: {
    borderColor: "#636128",
    backgroundColor: "#636128",
  },
  subscriptionCheckText: {
    flex: 1,
    fontFamily: FONTS.montserrat,
    fontSize: 13,
    lineHeight: 19,
    color: "#352E2E",
  },
  subscriptionPrimaryButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#636128",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.md,
  },
  subscriptionPrimaryButtonText: {
    fontFamily: FONTS.impact,
    fontSize: 16,
    color: "#ECE5D2",
  },
  subscriptionGhostButton: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#636128",
    alignItems: "center",
    justifyContent: "center",
  },
  subscriptionGhostButtonText: {
    fontFamily: FONTS.impact,
    fontSize: 14,
    color: "#636128",
  },
  subscriptionDangerButton: {
    alignSelf: "flex-start",
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#A83C24",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  subscriptionDangerButtonText: {
    fontFamily: FONTS.impact,
    fontSize: 16,
    color: "#F6F0DF",
  },
  subscriptionButtonDisabled: {
    opacity: 0.52,
  },
  notesCard: {
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    borderRadius: 12,
    backgroundColor: "#ECE5D2",
    gap: SPACING.sm,
  },
  notesTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#352E2E",
    fontFamily: FONTS.impact,
  },
  notesEmpty: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
  },
  noteItem: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D4C4A8",
    borderRadius: 10,
    padding: SPACING.sm,
  },
  noteTitle: {
    fontWeight: "700",
    color: "#352E2E",
  },
  noteMeta: {
    marginTop: 4,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  noteContent: {
    marginTop: 4,
    color: "#352E2E",
  },
  trainerCourseItem: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D4C4A8",
    borderRadius: 10,
    padding: SPACING.sm,
  },
  trainerCourseTitle: {
    fontWeight: "700",
    color: "#352E2E",
  },
  trainerCourseMeta: {
    color: COLORS.textSecondary,
    marginTop: 4,
    fontSize: 12,
  },
  // О себе
  aboutContainer: {
    width: "100%",
    marginTop: SPACING.md,
    padding: SPACING.md,
    backgroundColor: "#ECE5D2",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D4C4A8",
  },
  aboutTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#352E2E",
    marginBottom: SPACING.sm,
    fontFamily: FONTS.impact,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  aboutCard: {
    padding: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.cardBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    minHeight: 44,
  },
  aboutText: {
    fontSize: 14,
    color: "#352E2E",
    fontFamily: FONTS.montserrat,
    lineHeight: 20,
  },
  // Социальные сети
  socialLinksContainer: {
    width: "100%",
    marginTop: SPACING.md,
    padding: SPACING.md,
    backgroundColor: "#ECE5D2",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D4C4A8",
  },
  socialLinksTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#352E2E",
    marginBottom: SPACING.sm,
    fontFamily: FONTS.impact,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  socialLinksList: {
    flexDirection: "column",
    gap: SPACING.sm,
  },
  socialLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    padding: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.cardBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    minHeight: 44,
  },
  socialIcon: {
    fontSize: 20,
  },
  socialLabel: {
    fontWeight: "600",
    color: "#636128",
    minWidth: 80,
    fontSize: 14,
    fontFamily: FONTS.montserrat,
  },
  socialUsername: {
    color: "#352E2E",
    flex: 1,
    fontSize: 14,
    fontFamily: FONTS.montserrat,
  },
  passwordButton: {
    backgroundColor: "#636128",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
    shadowColor: "#636128",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  passwordButtonText: {
    color: "#ECE5D2",
    fontSize: 15,
    fontWeight: "600",
    fontFamily: FONTS.impact,
  },
  vkLinkedBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#F5F0E8",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
    minHeight: 48,
    width: "100%",
    borderWidth: 1,
    borderColor: "#D4C4A8",
  },
  vkLinkedBadgeText: {
    color: "#5A5744",
    fontSize: 15,
    fontWeight: "600",
    fontFamily: FONTS.montserrat,
  },
  deleteAccountButton: {
    backgroundColor: "rgba(198, 40, 40, 0.08)",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: "#c62828",
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  deleteAccountButtonText: {
    color: "#c62828",
    fontSize: 15,
    fontWeight: "600",
    fontFamily: FONTS.impact,
  },
  logoutButton: {
    backgroundColor: "#636128",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
    shadowColor: "#636128",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  logoutButtonText: {
    color: "#ECE5D2",
    fontSize: 15,
    fontWeight: "600",
    fontFamily: FONTS.impact,
  },
  // Информация (в самом низу)
  infoCard: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  infoCardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    fontFamily: FONTS.impact,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  infoIcon: {
    fontSize: 20,
    marginRight: SPACING.md,
    width: 24,
  },
  infoContent: {
    flex: 1,
  },
  infoItemTitle: {
    fontSize: 14,
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
  },
  infoItemDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    fontFamily: FONTS.montserrat,
  },
  infoArrow: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
  },
  infoDivider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginHorizontal: SPACING.md,
  },
});
