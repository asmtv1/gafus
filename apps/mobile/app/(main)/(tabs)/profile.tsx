import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Alert, Pressable, Linking, Platform } from "react-native";
import { Text } from "react-native-paper";
import { FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useShallow } from "zustand/react/shallow";
import { StatusBar } from "expo-status-bar";

import { ProfileIcon } from "@/features/profile";
import { ProfileFeedPreview } from "@/features/feed/ProfileFeedPreview";

import { Button, Card } from "@/shared/components/ui";
import { TexturedSafeAreaView } from "@/shared/components";
import {
  appSubscriptionApi,
  requestAppSubscriptionPaywall,
  useAppSubscriptionStatus,
} from "@/features/app-subscription";
import { useMobileOnboardingTourStore } from "@/features/onboarding-tour";
import { useAuthStore } from "@/shared/stores";
import { useVkLink } from "@/shared/hooks";
import { subscriptionsApi } from "@/shared/lib/api";
import { useMobileAppPublicConfig } from "@/shared/lib/api/public-config-query";
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
        <View style={styles.subscriptionHeader}>
          <ProfileIcon name="premium" />
          <Text style={styles.subscriptionTitle}>Подписка Gafus Premium</Text>
        </View>
        <Text style={styles.subscriptionMuted}>Загружаем данные подписки...</Text>
      </View>
    );
  }

  if (!isActive) {
    return (
      <View style={styles.subscriptionCard}>
        <View style={styles.subscriptionHeader}>
          <ProfileIcon name="premium" />
          <Text style={styles.subscriptionTitle}>Подписка Gafus Premium</Text>
          <View style={[styles.subscriptionStatusBadge, styles.subscriptionStatusInactive]}>
            <Text style={[styles.subscriptionStatusText, { color: "#A83C24" }]}>
              Не активна
            </Text>
          </View>
        </View>
        <Text style={styles.subscriptionMuted}>
          Откройте больше возможностей для вас и вашего питомца.
        </Text>
        <View style={styles.subscriptionBenefits}>
          {[
            "Все курсы и тренировки",
            "Консультации с кинологом",
            "Документы питомца",
            "Эксклюзивные материалы",
          ].map((benefit) => (
            <View key={benefit} style={styles.subscriptionBenefit}>
              <MaterialCommunityIcons name="check-circle" size={22} color={COLORS.primary} />
              <Text style={styles.subscriptionBenefitText}>{benefit}</Text>
            </View>
          ))}
        </View>
        <Image
          source={require("../../../assets/images/profile-premium-mascot.png")}
          style={styles.subscriptionArt}
          contentFit="contain"
          accessible={false}
        />
        <Button
          label="Оформить подписку"
          height={48}
          fontFamily={FONTS.impact}
          fontSize={16}
          lineHeight={20}
          horizontalPadding={SPACING.md}
          verticalPadding={0}
          borderRadius={14}
          onPress={() => requestAppSubscriptionPaywall("required")}
        />
        <Button
          label="Обновить статус"
          variant="caramel"
          animatedPress
          height={48}
          onPress={() => void refetch()}
        />
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

  const isPartnerAccess =
    status?.provider === "MANUAL" &&
    status?.isLifetime &&
    status.paymentMethodTitle === "Партнёрская программа";

  return (
    <View style={styles.subscriptionCard}>
      <View style={styles.subscriptionHeader}>
        <ProfileIcon name="premium" />
        <Text style={styles.subscriptionTitle}>Подписка Gafus Premium</Text>
        <View style={styles.subscriptionStatusBadge}>
          <Text style={styles.subscriptionStatusText}>Активна</Text>
        </View>
      </View>

      {isPartnerAccess ? (
        <Text style={styles.subscriptionMuted}>
          Бесплатный бессрочный доступ участника партнёрской программы.
        </Text>
      ) : (
        <>
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
            <Text style={styles.subscriptionValue}>
              {status?.paymentMethodLast4
                ? `•••• ${status.paymentMethodLast4}`
                : (status?.paymentMethodTitle ?? "—")}
            </Text>
          </View>
        </>
      )}

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
          <Button
            label={cancelMutation.isPending ? "Удаляем..." : "Удалить способ оплаты"}
            variant="secondary"
            height={48}
            onPress={handleUnlink}
            disabled={!unlinkConfirmed || cancelMutation.isPending}
            loading={cancelMutation.isPending}
          />
        </>
      ) : (
        <Text style={styles.subscriptionMuted}>
          Автопродление включится после сохранения способа оплаты.
        </Text>
      )}
      <Button
        label="Обновить статус"
        variant="caramel"
        animatedPress
        height={48}
        onPress={() => void refetch()}
      />
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
  const { data: publicConfigResponse, isFetched: publicConfigFetched } = useMobileAppPublicConfig();

  /** После смены email на web стор мог остаться со старым user — подтягиваем GET /profile */
  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      void queryClient.invalidateQueries({ queryKey: ["app-subscription"] });
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
  const cachedAvatarUrl = user?.profile?.avatarUrl?.trim() || null;
  const displayEmail = profileUser?.email?.trim() || user?.email?.trim() || "";
  const hasAppPassword = profileData?.data?.hasAppPassword ?? user?.hasAppPassword ?? false;
  const hasVkLinked = profileData?.data?.hasVkLinked ?? false;
  const canLinkVk =
    Platform.OS !== "ios"
      ? true
      : publicConfigFetched && Boolean(publicConfigResponse?.data?.vkLoginEnabledOnIos);

  const { handleVkLink, isVkLinkLoading } = useVkLink({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      Alert.alert("Готово", "VK успешно подключён");
    },
    onError: (msg) => Alert.alert("Ошибка", msg),
  });
  const avatarUrl = profile?.avatarUrl?.trim() || cachedAvatarUrl;
  const greetingName = user?.username || "пользователь";
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
    <TexturedSafeAreaView style={styles.container} edges={[]}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Image
          source={require("../../../assets/images/profile-header.png")}
          style={styles.headerImage}
          contentFit="cover"
          contentPosition="center"
          accessible
          accessibilityLabel="Профиль. Ваш аккаунт и персональные настройки"
        />
        <View style={styles.profileContent}>
          {/* Аватарка и компактная подложка с приветствием */}
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
            <LinearGradient
              colors={["#777631", COLORS.primary, "#4C4B20"]}
              locations={[0, 0.7, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.profileInfo}
            >
              <Text style={styles.greeting}>Привет, {greetingName}!</Text>
              {displayRole && (
                <View style={[styles.roleBadge, { backgroundColor: roleColor }]}>
                  <Text style={styles.roleText}>{displayRole}</Text>
                </View>
              )}
            </LinearGradient>
          </View>

          {/* Контейнер с информацией о себе */}
          <View style={styles.infoContainer}>
            <View style={styles.bioCard}>
              {age !== null && (
                <Text style={styles.infoText}>
                  Возраст: {age} {declOfNum(age, ["год", "года", "лет"])}
                </Text>
              )}

              {/* О себе */}
              {(profile?.about || !age) && (
                <View style={styles.aboutContainer}>
                  <View style={styles.sectionHeading}>
                    <ProfileIcon name="about" />
                    <Text style={styles.aboutTitle}>О себе</Text>
                  </View>
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
                        onPress={() =>
                          Linking.openURL(`https://instagram.com/${profile.instagram}`)
                        }
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

              <Button
                label="Внести/Изменить «О себе»"
                height={48}
                fontFamily={FONTS.impact}
                fontWeight="600"
                fontSize={13}
                lineHeight={18}
                horizontalPadding={16}
                verticalPadding={8}
                borderRadius={12}
                style={styles.editBioButtonLayout}
                onPress={() => {
                  trackProfileClick("profile-edit-open");
                  router.push({ pathname: "/profile/edit" });
                }}
              />
            </View>
            <ProfileFeedPreview username={user?.username ?? ""} />
            <View style={styles.notificationsCard}>
              <View style={styles.sectionHeading}>
                <ProfileIcon name="notifications" />
                <Text style={styles.notificationsTitle}>Уведомления</Text>
              </View>
              <Pressable
                style={[styles.notifyStatusRow, styles.notifyStatusDivider]}
                accessibilityRole="button"
                accessibilityLabel="Разрешение телефона. Настроить уведомления"
                disabled={enablePushMutation.isPending || disablePushMutation.isPending}
                onPress={() => {
                  if (osPermission === "undetermined") enablePushMutation.mutate();
                  else void Linking.openSettings();
                }}
              >
                <MaterialCommunityIcons name="cellphone" size={25} color={COLORS.primary} />
                <View style={styles.notifyRowContent}>
                  <Text style={styles.notifyStatusLabel}>Разрешение телефона</Text>
                  <Text style={styles.notifyRowSubtitle}>Чтобы получать уведомления</Text>
                </View>
                <View style={[styles.notifyStatusBadge,
                  osPermission === "granted" ? styles.notifyBadgeOk
                    : osPermission === "denied" ? styles.notifyBadgeFail : styles.notifyBadgeWarn]}>
                  <Text style={styles.notifyBadgeText}>
                    {enablePushMutation.isPending ? "Загрузка…" : osPermission === "granted"
                      ? "Разрешено" : osPermission === "denied" ? "Запрещено" : "Не запрошено"}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={21} color="#352E2E" />
              </Pressable>
              <Pressable
                style={styles.notifyStatusRow}
                accessibilityRole="button"
                accessibilityLabel="Подписка на этом устройстве. Настроить уведомления"
                disabled={enablePushMutation.isPending || disablePushMutation.isPending || pushDeviceStatusPending}
                onPress={() => {
                  if (osPermission === "denied") void Linking.openSettings();
                  else if (pushServerDetermined && hasThisDevicePushOnServer) disablePushMutation.mutate();
                  else enablePushMutation.mutate();
                }}
              >
                <MaterialCommunityIcons name="email" size={25} color={COLORS.primary} />
                <View style={styles.notifyRowContent}>
                  <Text style={styles.notifyStatusLabel}>Подписка на этом устройстве</Text>
                  <Text style={styles.notifyRowSubtitle}>Уведомления в приложении</Text>
                </View>
                <View style={[styles.notifyStatusBadge,
                  pushDeviceStatusPending || enablePushMutation.isPending || disablePushMutation.isPending
                    ? styles.notifyBadgeChecking : pushDeviceStatusError ? styles.notifyBadgeFail
                    : !pushServerDetermined ? styles.notifyBadgeWarn
                    : hasThisDevicePushOnServer ? styles.notifyBadgeOk : styles.notifyBadgeFail]}>
                  <Text style={styles.notifyBadgeText}>
                    {enablePushMutation.isPending || disablePushMutation.isPending ? "Загрузка…"
                      : pushDeviceStatusPending ? "Проверка…" : pushDeviceStatusError ? "Ошибка"
                      : !pushServerDetermined ? "Нет токена" : hasThisDevicePushOnServer ? "Активна" : "Неактивна"}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={21} color="#352E2E" />
              </Pressable>
            </View>

            <Pressable
              style={styles.remindersCard}
              onPress={() => {
                trackProfileClick("training-reminders-open");
                router.push({ pathname: "/reminders" });
              }}
            >
              <ProfileIcon name="reminders" />
              <View style={styles.remindersCardContent}>
                <Text style={styles.remindersCardTitle}>Напоминания о тренировках</Text>
                <Text style={styles.remindersCardSubtitle}>Настроить время и дни</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.primary} />
            </Pressable>

            <MobileAppSubscriptionCard />

            {user?.role === "PARTNER" ? (
              <Pressable
                style={styles.remindersCard}
                onPress={() => {
                  trackProfileClick("partner-dashboard-open");
                  router.push("/partner" as Href);
                }}
              >
                <MaterialCommunityIcons
                  name="account-group-outline"
                  size={22}
                  color={COLORS.primary}
                />
                <View style={styles.remindersCardContent}>
                  <Text style={styles.remindersCardTitle}>Партнёрская программа</Text>
                  <Text style={styles.remindersCardSubtitle}>Ссылка, вознаграждения и выплаты</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.primary} />
              </Pressable>
            ) : null}

            <Pressable style={styles.remindersCard} onPress={handleRepeatOnboardingTour}>
              <ProfileIcon name="tour" />
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
                <View style={[styles.sectionHeading, styles.notesHeading]}>
                  <ProfileIcon name="trainer-notes" />
                  <Text style={styles.notesTitle}>Заметки тренера</Text>
                </View>
                {studentNotes.length === 0 ? (
                  <View style={styles.notesEmptyState}>
                    <ProfileIcon name="notes-empty" size={50} />
                    <Text style={styles.notesEmpty}>Пока нет заметок от тренера</Text>
                  </View>
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

          {!hasVkLinked && canLinkVk ? (
            <Button
              label={isVkLinkLoading ? "Подключение..." : "Подключить VK"}
              buttonColor="#0077FF"
              textColor="#FFFFFF"
              labelStyle={{ color: "#FFFFFF" }}
              gradient={false}
              icon={({ size }) => <FontAwesome5 name="vk" size={size} color="#FFFFFF" />}
              loading={isVkLinkLoading}
              height={48}
              fontFamily={FONTS.impact}
              fontWeight="600"
              fontSize={15}
              lineHeight={20}
              horizontalPadding={28}
              verticalPadding={14}
              borderRadius={12}
              style={styles.profileActionButtonLayout}
              onPress={handleVkLink}
              disabled={isVkLinkLoading}
            />
          ) : hasVkLinked ? (
            <View style={styles.vkLinkedBadge}>
              <MaterialCommunityIcons name="check-circle" size={22} color={COLORS.success} />
              <Text style={styles.vkLinkedBadgeText}>VK подключён</Text>
            </View>
          ) : null}

          <Text style={styles.groupTitle}>Данные аккаунта</Text>
          <View style={styles.menuGroup}>
            <Pressable
              accessibilityRole="button"
              style={styles.infoItem}
              onPress={() => router.push({ pathname: "/profile/change-username" })}
            >
              <ProfileIcon name="login" />
              <View style={styles.infoContent}>
                <Text style={styles.infoItemTitle}>Логин</Text>
                <Text style={styles.infoItemDesc}>{user?.username}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.textSecondary} />
            </Pressable>
            <View style={styles.infoDivider} />
            <Pressable
              accessibilityRole="button"
              style={styles.infoItem}
              onPress={() => router.push("/profile/change-email" as Href)}
            >
              <ProfileIcon name="email" />
              <View style={styles.infoContent}>
                <Text style={styles.infoItemTitle}>Email</Text>
                <Text style={styles.infoItemDesc}>{displayEmail || USER_EMAIL_MISSING_HINT}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.textSecondary} />
            </Pressable>
            <View style={styles.infoDivider} />
            <Pressable
              accessibilityRole="button"
              style={styles.infoItem}
              onPress={() =>
                router.push(
                  hasAppPassword ? ("/profile/change-password" as Href) : "/profile/set-password",
                )
              }
            >
              <ProfileIcon name="password" />
              <View style={styles.infoContent}>
                <Text style={styles.infoItemTitle}>
                  {hasAppPassword ? "Сменить пароль" : "Установить пароль"}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.textSecondary} />
            </Pressable>
          </View>

          {/* Информация (в самом низу) */}
          <Card style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>Информация</Text>

            <Pressable
              style={styles.infoItem}
              onPress={() => router.push("/(auth)/intro?manual=1" as Href)}
            >
              <ProfileIcon name="app-info" />
              <View style={styles.infoContent}>
                <Text style={styles.infoItemTitle}>О приложении</Text>
                <Text style={styles.infoItemDesc}>
                  Версия {Constants.expoConfig?.version ?? "—"}
                </Text>
              </View>
            </Pressable>

            <View style={styles.infoDivider} />

            <Pressable style={styles.infoItem} onPress={() => Linking.openURL(GAFUS_TELEGRAM_URL)}>
              <ProfileIcon name="telegram" />
              <View style={styles.infoContent}>
                <Text style={styles.infoItemTitle}>Наш Telegram</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.textSecondary} />
            </Pressable>

            <View style={styles.infoDivider} />

            <Pressable
              style={styles.infoItem}
              onPress={() => Linking.openURL(DOCUMENT_URLS.policy)}
            >
              <ProfileIcon name="privacy" />
              <View style={styles.infoContent}>
                <Text style={styles.infoItemTitle}>Политика конфиденциальности</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.textSecondary} />
            </Pressable>

            <View style={styles.infoDivider} />

            <Pressable
              style={styles.infoItem}
              onPress={() => Linking.openURL(DOCUMENT_URLS.oferta)}
            >
              <ProfileIcon name="offer" />
              <View style={styles.infoContent}>
                <Text style={styles.infoItemTitle}>Оферта</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.textSecondary} />
            </Pressable>

            <View style={styles.infoDivider} />

            <Pressable
              style={styles.infoItem}
              onPress={() => Linking.openURL(DOCUMENT_URLS.personal)}
            >
              <ProfileIcon name="consent" />
              <View style={styles.infoContent}>
                <Text style={styles.infoItemTitle}>Согласие на обработку персональных данных</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.textSecondary} />
            </Pressable>

            <View style={styles.infoDivider} />

            <Pressable
              style={styles.infoItem}
              onPress={() => Linking.openURL(DOCUMENT_URLS.personalDistribution)}
            >
              <ProfileIcon name="distribution" />
              <View style={styles.infoContent}>
                <Text style={styles.infoItemTitle}>Согласие на распространение данных</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.textSecondary} />
            </Pressable>

            <View style={styles.infoDivider} />

            <Pressable
              style={styles.infoItem}
              onPress={() => Linking.openURL(SUPPORT_TELEGRAM_URL)}
            >
              <ProfileIcon name="support" />
              <View style={styles.infoContent}>
                <Text style={styles.infoItemTitle}>Связаться с поддержкой</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.textSecondary} />
            </Pressable>
          </Card>
          <Text style={styles.groupTitle}>Действия с аккаунтом</Text>
          <View style={styles.accountActions}>
            <Button
              label="Выйти из аккаунта"
              variant="secondary"
              height={52}
              onPress={handleLogout}
              icon={() => <ProfileIcon name="logout" size={30} />}
            />
            <Button
              label="Удалить аккаунт"
              variant="secondary"
              height={52}
              onPress={() => router.push("/profile/delete-account")}
              icon={() => <ProfileIcon name="delete-account" size={30} />}
            />
          </View>
        </View>
      </ScrollView>
    </TexturedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  bioCard: {
    padding: SPACING.md,
    backgroundColor: COLORS.cardBackground,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E5DDC9",
  },
  groupTitle: {
    fontFamily: FONTS.impact,
    fontSize: 18,
    color: COLORS.text,
    marginTop: 20,
    marginBottom: 12,
  },
  menuGroup: { backgroundColor: COLORS.cardBackground, borderRadius: 22, paddingVertical: 4 },
  accountActions: { gap: 12, padding: SPACING.md, backgroundColor: COLORS.cardBackground, borderRadius: 22 },
  notesHeading: { marginBottom: 6 },
  notesEmptyState: { alignItems: "center", gap: 12, paddingTop: 4, paddingBottom: 16 },
  subscriptionBenefits: { gap: 12, paddingVertical: 8 },
  subscriptionBenefit: { flexDirection: "row", alignItems: "center", gap: 10 },
  subscriptionBenefitText: {
    flex: 1,
    fontFamily: FONTS.montserrat,
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.text,
  },
  subscriptionArt: { width: "100%", height: 210 },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingBottom: SPACING.xxl,
  },
  headerImage: {
    width: "100%",
    height: 180,
  },
  profileContent: {
    padding: SPACING.md,
  },
  // Полоска начинается под аватаркой и выходит из-за неё вправо.
  profileBanner: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginBottom: SPACING.md,
  },
  avatarContainer: {
    position: "relative",
    zIndex: 1,
    width: 108,
    height: 108,
    flexShrink: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarWrapper: {
    width: 98,
    height: 98,
    borderRadius: 49,
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
    left: "50%",
    marginLeft: -14,
    bottom: 5,
    backgroundColor: "rgba(246, 240, 223, 0.24)",
    borderRadius: 14,
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F6F0DF",
  },
  avatarEditText: {
    fontSize: 14,
  },
  profileInfo: {
    flex: 1,
    flexDirection: "column",
    gap: 4,
    marginLeft: -54,
    alignSelf: "flex-end",
    marginBottom: 5,
    minHeight: 56,
    justifyContent: "center",
    paddingVertical: SPACING.sm,
    paddingLeft: 54 + SPACING.sm,
    paddingRight: SPACING.md,
    borderTopRightRadius: 28,
    borderBottomRightRadius: 28,
    overflow: "hidden",
  },
  greeting: {
    fontSize: 19,
    color: "#ECE5D2",
    fontFamily: FONTS.impact,
    lineHeight: 20,
    textAlign: "center",
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
  infoContainer: { width: "100%", marginBottom: SPACING.md },
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
    backgroundColor: COLORS.cardBackground,
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
  editBioButtonLayout: {
    marginTop: SPACING.sm,
  },
  notificationsCard: {
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.sm + 2,
    paddingTop: SPACING.sm,
    borderRadius: 16,
    backgroundColor: COLORS.cardBackground,
  },
  notificationsTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#352E2E",
    fontFamily: FONTS.impact,
  },
  notifyStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.sm + 2,
    minHeight: 64,
  },
  notifyStatusDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "#EAE2D2",
  },
  notifyRowContent: {
    flex: 1,
    gap: 3,
  },
  notifyStatusLabel: {
    fontFamily: FONTS.montserrat,
    fontSize: 12,
    fontWeight: "600",
    color: "#352E2E",
  },
  notifyRowSubtitle: {
    fontFamily: FONTS.montserrat,
    fontSize: 11,
    color: "#756F63",
  },
  notifyStatusBadge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 96,
    alignItems: "center",
  },
  notifyBadgeOk: {
    backgroundColor: "#D4EDDA",
  },
  notifyBadgeFail: {
    backgroundColor: "#F8D7DA",
  },
  notifyBadgeWarn: {
    backgroundColor: "#FCEBC5",
  },
  notifyBadgeChecking: {
    backgroundColor: "#D3E0F2",
  },
  notifyBadgeText: {
    fontSize: 11,
    fontFamily: FONTS.montserrat,
    fontWeight: "600",
    color: "#352E2E",
  },
  remindersCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: "#E5DDC9",
    borderRadius: 22,
    backgroundColor: COLORS.cardBackground,
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
    borderColor: "#E5DDC9",
    borderRadius: 22,
    backgroundColor: COLORS.cardBackground,
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
    borderColor: "#E5DDC9",
    borderRadius: 22,
    backgroundColor: COLORS.cardBackground,
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
  aboutContainer: { width: "100%", marginBottom: SPACING.sm },
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
    backgroundColor: COLORS.cardBackground,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E5DDC9",
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
  profileActionButtonLayout: {
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
  },
  vkLinkedBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.cardBackground,
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
  // Информация (в самом низу)
  infoCard: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.cardBackground,
    borderRadius: 22,
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
    minHeight: 64,
    gap: 12,
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
    minWidth: 0,
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
