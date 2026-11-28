import { useCallback, useEffect, useMemo, useState } from "react";
import { View, ScrollView, Alert, Pressable, Linking } from "react-native";
import { Text } from "react-native-paper";
import { FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import { Image } from "expo-image";
import { MediaPickerError, pickMedia } from "@/shared/lib/media/mediaPicker";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useShallow } from "zustand/react/shallow";
import { StatusBar } from "expo-status-bar";
import { ProfileIcon, ProfileMetaRow } from "@/features/profile";
import { ProfileFeedPreview } from "@/features/feed/ProfileFeedPreview";
import { Button, Card } from "@/shared/components/ui";
import { TexturedSafeAreaView } from "@/shared/components";
import { useMobileOnboardingTourStore } from "@/features/onboarding-tour";
import { useAuthStore } from "@/shared/stores";
import { pushDeviceStatusForActor, studentNotesQueryOptions, trainerPublicProfileQueryOptions } from "@/shared/lib/api/profileTabQueries";
import { userApi } from "@/shared/lib/api/user";
import { verifiedOwnProfileActor, isCurrentOwnProfileActor, ownProfileForActor, ownProfileQueryOptions } from "@/features/profile/ownProfileRead";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { reportClientError, reportClientErrorAndWait } from "@/shared/lib/error-reporting";
import { canSendMobileTelemetrySelfTest, sendMobileTelemetrySelfTest } from "@/shared/lib/error-reporting/mobileTelemetrySelfTest";
import { getVerifiedPushActor, isSameVerifiedPushActor, setupPushNotifications, unregisterCurrentDevicePushNotifications } from "@/shared/lib/utils/notifications";
import { usePushRegistrationLiveness } from "@/shared/lib/utils/usePushRegistrationLiveness";
import { COLORS, FONTS } from "@/shared/config";
import { USER_EMAIL_MISSING_HINT } from "@gafus/types";
import { trackEvent } from "@/shared/lib/analytics";
import { styles } from "@/features/profile/profileTabStyles";
import { MobileAppSubscriptionCard } from "@/features/profile/MobileAppSubscriptionCard";
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
  const isPushScreenLive = usePushRegistrationLiveness();
  const startOnboardingTour = useMobileOnboardingTourStore((s) => s.startTour);
  const { user, logout, setUser } = useAuthStore(
    useShallow((s) => ({
      user: s.user,
      logout: s.logout,
      setUser: s.setUser,
    })),
  );

  // This tab displays only a verified owner+native-epoch GET, never global cache.
  const liveActor = verifiedOwnProfileActor();
  // Stable object by principal/epoch: avoid repeating setUser after each render.
  const actorOwnerId = liveActor?.ownerId ?? null;
  const actorEpoch = liveActor?.authEpoch ?? null;
  const actor = useMemo(
    () => actorOwnerId && actorEpoch ? { ownerId: actorOwnerId, authEpoch: actorEpoch } : null,
    [actorOwnerId, actorEpoch],
  );
  const ownProfileOptions = ownProfileQueryOptions(actor);
  const {
    data: profileData,
    isPending: profilePending,
    isError: profileError,
    isFetching: profileFetching,
    refetch: refetchProfile,
  } = useQuery(ownProfileOptions);
  const profileUser = useMemo(
    () => ownProfileForActor(profileData, actor),
    [profileData, actor],
  );

  /** После смены email на web стор мог остаться со старым user — подтягиваем GET /profile */
  useFocusEffect(
    useCallback(() => {
      if (isCurrentOwnProfileActor(actor)) {
        void queryClient.invalidateQueries({
          queryKey: ["user-profile", "own-tab", actor?.ownerId, actor?.authEpoch], exact: true,
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["app-subscription"] });
    }, [queryClient, actor]),
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
    if (!profileUser || !isCurrentOwnProfileActor(actor)) return;
    setUser(profileUser);
  }, [profileUser, setUser, actor]);

  const verifiedPushActor = getVerifiedPushActor();
  const pushActor = verifiedPushActor?.ownerId === user?.id ? verifiedPushActor : null;
  const pushStatusOptions = pushDeviceStatusForActor(pushActor);
  const {
    data: pushDeviceStatus,
    isPending: pushDeviceStatusPending,
    isError: pushDeviceStatusError,
  } = useQuery(pushStatusOptions);

  const {
    data: studentNotesData,
    isPending: studentNotesPending,
    isFetching: studentNotesFetching,
    isError: studentNotesQueryError,
    error: studentNotesError,
    refetch: refetchStudentNotes,
  } = useQuery({
    ...studentNotesQueryOptions,
    enabled: user?.role === "USER",
  });

  const {
    data: trainerProfileData,
    isPending: trainerProfilePending,
    isFetching: trainerProfileFetching,
    isError: trainerProfileQueryError,
    error: trainerProfileError,
    refetch: refetchTrainerProfile,
  } = useQuery({
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
      const actor = getVerifiedPushActor();
      const ok = actor && (await setupPushNotifications({ isLive: isPushScreenLive }));
      return { success: Boolean(ok), actor };
    },
    onSuccess: async (result) => {
      if (!isPushScreenLive() || !isSameVerifiedPushActor(result.actor)) return;
      void refreshOsPermission();
      if (!result.success) {
        Alert.alert(
          "Уведомления",
          "Не удалось подтвердить включение. Проверьте статус устройства.",
        );
        return;
      }
      try {
        // Native POST ACK alone is not proof of active server-side ownership.
        const status = await queryClient.fetchQuery(pushDeviceStatusForActor(result.actor));
        if (!isPushScreenLive() || !isSameVerifiedPushActor(result.actor)) return;
        if (!status.determined || !status.hasThisDeviceSubscription) {
          Alert.alert("Уведомления", "Регистрация отправлена. Статус устройства не подтверждён.");
          return;
        }
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
      const actor = getVerifiedPushActor();
      const success =
        actor && (await unregisterCurrentDevicePushNotifications({ isLive: isPushScreenLive }));
      return { success: Boolean(success), actor };
    },
    onSuccess: async (result) => {
      if (!isPushScreenLive() || !isSameVerifiedPushActor(result.actor)) return;
      if (!result.success) {
        Alert.alert("Уведомления", "Отключение не подтверждено. Проверьте подписку устройства.");
        return;
      }
      try {
        const status = await queryClient.fetchQuery(pushDeviceStatusForActor(result.actor));
        if (!isPushScreenLive() || !isSameVerifiedPushActor(result.actor)) return;
        if (!status.determined || status.hasThisDeviceSubscription) {
          Alert.alert("Уведомления", "Отключение отправлено. Текущий статус неизвестен.");
          return;
        }
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

  const profile = profileUser?.profile;
  // Never fall back to a previous session's profile/URL while scoped GET is pending.
  const displayEmail = profileUser?.email?.trim() || "";
  const hasAppPassword = profileUser?.hasAppPassword ?? false;
  const avatarUrl = profile?.avatarUrl?.trim() || null;
  const greetingName = profileUser?.username || "пользователь";
  const avatarCacheKey = avatarUrl
    ? `user-avatar-${profileUser?.id ?? user?.id ?? "me"}-${avatarUrl}`
    : "user-avatar-placeholder";
  const displayRole = getRoleLabel(profileUser?.role);
  const pushServerDetermined = pushDeviceStatus?.determined === true;
  const hasThisDevicePushOnServer = pushDeviceStatus?.hasThisDeviceSubscription === true;
  // Only a confirmed successful GET with an array may produce notes or "empty".
  // Hide cached private content while any fresh read is pending or has failed.
  const studentNotesLoading = studentNotesPending || studentNotesFetching;
  const studentNotesFailed = !studentNotesLoading && (
    studentNotesQueryError || studentNotesData?.success !== true ||
    !Array.isArray(studentNotesData.data)
  );
  const studentNotesTerminal =
    studentNotesData?.code === "SESSION_EXPIRED" ||
    studentNotesData?.code === "G05_SESSION_CHANGED" ||
    (studentNotesError instanceof Error && (
      studentNotesError.message === "SESSION_EXPIRED" ||
      studentNotesError.message === "G05_SESSION_CHANGED"
    ));
  const studentNotes = !studentNotesLoading && !studentNotesFailed &&
    Array.isArray(studentNotesData?.data) ? studentNotesData.data : [];
  // An unconfirmed read must never be presented as a confirmed empty list.
  // Hide stale cached courses during both initial GET and background revalidation.
  const trainerCoursesQueryEnabled = !!user?.username;
  const trainerCoursesLoading = trainerCoursesQueryEnabled &&
    (trainerProfilePending || trainerProfileFetching);
  const trainerCoursesFailed = !trainerCoursesLoading && (
    !trainerCoursesQueryEnabled || trainerProfileQueryError ||
    trainerProfileData?.success !== true ||
    !Array.isArray(trainerProfileData?.data?.courses)
  );
  const trainerCoursesTerminal = !trainerCoursesQueryEnabled ||
    trainerProfileData?.code === "SESSION_EXPIRED" ||
    trainerProfileData?.code === "G05_SESSION_CHANGED" ||
    (trainerProfileError instanceof Error && (
      ("code" in trainerProfileError && (
        trainerProfileError.code === "SESSION_EXPIRED" ||
        trainerProfileError.code === "G05_SESSION_CHANGED"
      )) ||
      trainerProfileError.message === "SESSION_EXPIRED" ||
      trainerProfileError.message === "G05_SESSION_CHANGED"
    ));
  const trainerCourses = !trainerCoursesLoading && !trainerCoursesFailed &&
    Array.isArray(trainerProfileData?.data?.courses)
    ? trainerProfileData.data.courses : [];
  const canShowTelemetrySelfTest = canSendMobileTelemetrySelfTest(profileUser);
  const [telemetrySelfTestPending, setTelemetrySelfTestPending] = useState(false);

  const roleColor = getRoleColor(profileUser?.role);

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

  const handleTelemetrySelfTest = async () => {
    if (telemetrySelfTestPending) return;
    trackProfileClick("mobile-telemetry-self-test");
    setTelemetrySelfTestPending(true);
    /* eslint-disable @gafus/require-client-catch-tracer -- telemetry self-test failures should not recurse */
    try {
      await sendMobileTelemetrySelfTest(reportClientErrorAndWait);
      Alert.alert("Диагностика", "Тестовая JS-ошибка сохранена в локальную очередь отправки.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Неизвестная ошибка отправки";
      Alert.alert("Диагностика", `Не удалось сохранить тестовую ошибку: ${message}`);
    } finally {
      setTelemetrySelfTestPending(false);
    }
    /* eslint-enable @gafus/require-client-catch-tracer */
  };

  const age = profile?.birthDate ? getAge(profile.birthDate) : null;
  const hasSocialLinks = profile?.instagram || profile?.telegram || profile?.website;

  const pickImageAndUploadAvatar = async () => {
    try {
      const result = await pickMedia({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      }, {
        onPermissionDenied: () => Alert.alert("Доступ", "Нужен доступ к фото для смены аватара"),
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
      Alert.alert("Ошибка", err instanceof MediaPickerError ? err.message : "Не удалось выбрать фото");
    }
  };

  // No private profile/name/avatar is rendered until an exact owned GET succeeds.
  if (!isCurrentOwnProfileActor(actor)) {
    return (
      <TexturedSafeAreaView style={styles.container} edges={[]}>
        <Text>Войдите в аккаунт, чтобы открыть профиль.</Text>
      </TexturedSafeAreaView>
    );
  }
  if (profilePending || profileFetching) {
    return (
      <TexturedSafeAreaView style={styles.container} edges={[]}>
        <Text>Загрузка профиля…</Text>
      </TexturedSafeAreaView>
    );
  }
  if (profileError || !profileUser) {
    return (
      <TexturedSafeAreaView style={styles.container} edges={[]}>
        <Text>Не удалось загрузить профиль.</Text>
        <Pressable accessibilityRole="button" onPress={() => void refetchProfile()}>
          <Text>Повторить загрузку профиля</Text>
        </Pressable>
      </TexturedSafeAreaView>
    );
  }

  return (
    <TexturedSafeAreaView style={styles.container} edges={[]}>
      <StatusBar style="dark" />
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
              <ProfileMetaRow
                city={profile?.city}
                ageLabel={
                  age !== null ? `Возраст: ${age} ${declOfNum(age, ["год", "года", "лет"])}` : null
                }
              />

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
                  <View style={styles.sectionHeading}>
                    <ProfileIcon name="contacts" />
                    <Text style={styles.socialLinksTitle}>КОНТАКТЫ</Text>
                  </View>
                  <View style={styles.socialLinksList}>
                    {profile?.instagram && (
                      <Pressable
                        style={styles.socialLink}
                        onPress={() =>
                          Linking.openURL(`https://instagram.com/${profile.instagram}`)
                        }
                      >
                        <FontAwesome5
                          name="instagram"
                          brand
                          size={22}
                          color="#C13584"
                          style={styles.socialBrandIcon}
                        />
                        <Text style={styles.socialLabel}>Instagram</Text>
                        <Text style={styles.socialUsername}>{profile.instagram}</Text>
                      </Pressable>
                    )}
                    {profile?.telegram && (
                      <Pressable
                        style={styles.socialLink}
                        onPress={() => Linking.openURL(`https://t.me/${profile.telegram}`)}
                      >
                        <FontAwesome5
                          name="telegram-plane"
                          brand
                          size={22}
                          color="#229ED9"
                          style={styles.socialBrandIcon}
                        />
                        <Text style={styles.socialLabel}>Telegram</Text>
                        <Text style={styles.socialUsername}>{profile.telegram}</Text>
                      </Pressable>
                    )}
                    {profile?.website && (
                      <Pressable
                        style={styles.socialLink}
                        onPress={() => Linking.openURL(profile.website!)}
                      >
                        <MaterialCommunityIcons
                          name="web"
                          size={24}
                          color="#636128"
                          style={styles.socialBrandIcon}
                        />
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
            <ProfileFeedPreview username={profileUser.username} />
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
                    {enablePushMutation.isPending
                      ? "Загрузка…"
                      : osPermission === "granted"
                        ? "Разрешено"
                        : osPermission === "denied"
                          ? "Запрещено"
                          : "Не запрошено"}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={21} color="#352E2E" />
              </Pressable>
              <Pressable
                style={styles.notifyStatusRow}
                accessibilityRole="button"
                accessibilityLabel="Подписка на этом устройстве. Настроить уведомления"
                disabled={
                  enablePushMutation.isPending ||
                  disablePushMutation.isPending ||
                  pushDeviceStatusPending
                }
                onPress={() => {
                  if (osPermission === "denied") void Linking.openSettings();
                  else if (pushServerDetermined && hasThisDevicePushOnServer)
                    disablePushMutation.mutate();
                  else enablePushMutation.mutate();
                }}
              >
                <MaterialCommunityIcons name="email" size={25} color={COLORS.primary} />
                <View style={styles.notifyRowContent}>
                  <Text style={styles.notifyStatusLabel}>Подписка на этом устройстве</Text>
                  <Text style={styles.notifyRowSubtitle}>Уведомления в приложении</Text>
                </View>
                <View
                  style={[
                    styles.notifyStatusBadge,
                    pushDeviceStatusPending ||
                    enablePushMutation.isPending ||
                    disablePushMutation.isPending
                      ? styles.notifyBadgeChecking
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
                    {enablePushMutation.isPending || disablePushMutation.isPending
                      ? "Загрузка…"
                      : pushDeviceStatusPending
                        ? "Проверка…"
                        : pushDeviceStatusError
                          ? "Ошибка"
                          : !pushServerDetermined
                            ? "Нет токена"
                            : hasThisDevicePushOnServer
                              ? "Активна"
                              : "Неактивна"}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={21} color="#352E2E" />
              </Pressable>
            </View>

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

            {canShowTelemetrySelfTest ? (
              <Pressable
                style={styles.remindersCard}
                onPress={handleTelemetrySelfTest}
                disabled={telemetrySelfTestPending}
              >
                <MaterialCommunityIcons name="bug-check-outline" size={22} color={COLORS.primary} />
                <View style={styles.remindersCardContent}>
                  <Text style={styles.remindersCardTitle}>Проверить отправку ошибок</Text>
                  <Text style={styles.remindersCardSubtitle}>
                    {telemetrySelfTestPending ? "Отправка…" : "Отправить тестовую JS-ошибку"}
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
                {studentNotesLoading ? (
                  <Text style={styles.notesEmpty} accessibilityRole="text"
                    accessibilityLabel="Загружаем заметки тренера">
                    Загружаем заметки тренера…
                  </Text>
                ) : studentNotesFailed ? (
                  <View style={styles.notesEmptyState}>
                    <Text style={styles.notesEmpty} accessibilityRole="alert">
                      {studentNotesTerminal
                        ? "Заметки недоступны. Войдите в аккаунт снова."
                        : "Не удалось загрузить заметки тренера."}
                    </Text>
                    {!studentNotesTerminal && (
                      <Pressable accessibilityRole="button"
                        accessibilityLabel="Повторить загрузку заметок тренера"
                        disabled={studentNotesFetching}
                        accessibilityState={{ disabled: studentNotesFetching }}
                        onPress={() => { void refetchStudentNotes(); }}>
                        <Text style={styles.notesEmpty}>Повторить загрузку заметок тренера</Text>
                      </Pressable>
                    )}
                  </View>
                ) : studentNotes.length === 0 ? (
                  <View style={styles.notesEmptyState}>
                    <ProfileIcon name="notes-empty" size={50} />
                    <Text style={styles.notesEmpty}>Пока нет заметок от тренера</Text>
                  </View>
                ) : (
                  studentNotes.map((note) => (
                    <View key={note.id} style={styles.noteItem}>
                      <Text
                        style={styles.noteTitle}
                        accessibilityLabel={note.title?.trim() ? note.title : "Заметка без названия"}
                      >
                        {note.title?.trim() ? note.title : "Заметка без названия"}
                      </Text>
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
                {trainerCoursesLoading ? (
                  <Text style={styles.notesEmpty} accessibilityRole="text"
                    accessibilityLabel="Загружаем курсы кинолога">
                    Загружаем курсы кинолога…
                  </Text>
                ) : trainerCoursesFailed ? (
                  <View style={styles.notesEmptyState}>
                    <Text style={styles.notesEmpty} accessibilityRole="alert">
                      {trainerCoursesTerminal
                        ? "Курсы недоступны. Войдите в аккаунт снова."
                        : "Не удалось загрузить курсы кинолога."}
                    </Text>
                    {!trainerCoursesTerminal && (
                      <Pressable accessibilityRole="button"
                        accessibilityLabel="Повторить загрузку курсов кинолога"
                        disabled={trainerProfileFetching}
                        accessibilityState={{ disabled: trainerProfileFetching }}
                        onPress={() => { void refetchTrainerProfile(); }}>
                        <Text style={styles.notesEmpty}>Повторить загрузку курсов кинолога</Text>
                      </Pressable>
                    )}
                  </View>
                ) : trainerCourses.length === 0 ? (
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
                <Text style={styles.infoItemDesc}>{profileUser.username}</Text>
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
