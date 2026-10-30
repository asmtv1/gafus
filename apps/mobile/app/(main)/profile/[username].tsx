import { GalleryPreview } from "@/features/gallery";
import { ProfileFeedPreview } from "@/features/feed/ProfileFeedPreview";
import { ProfileIcon, ProfileMetaRow } from "@/features/profile";
import { PublicPets } from "@/features/pets/PublicPets";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Linking, Alert } from "react-native";
import { Text } from "react-native-paper";
import { AppBackButton, TexturedSafeAreaView as SafeAreaView } from "@/shared/components";
import { useFocusEffect, useLocalSearchParams, useRouter, Stack, type Href } from "expo-router";
import { FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";

import { API_BASE_URL, COLORS, FONTS, SPACING } from "@/shared/config";
import { Loading } from "@/shared/components/ui";
import { userApi, type PublicProfileCourse } from "@/shared/lib/api/user";
import { chat2 } from "@/features/chat2/api";
import { coursesApi } from "@/shared/lib/api/courses";
import { reportClientError } from "@/shared/lib/tracer";
import { getCourseLogoVariantCandidates } from "@/shared/lib/utils/mobileImageVariant";
import { useAuthStore } from "@/shared/stores/authStore";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import {
  projectPublicProfile,
  publicContactLinks,
} from "@/features/profile/public-profile-privacy";

// Функция для получения возраста
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
  } catch (error) {
    reportClientError(error instanceof Error ? error : new Error(String(error)), {
      issueKey: "PublicProfile",
      severity: "warning",
      keys: { operation: "get_age_from_birth_date" },
    });
    return null;
  }
};

// Функция для склонения
const declOfNum = (n: number, forms: [string, string, string]) => {
  const cases = [2, 0, 1, 1, 1, 2];
  return forms[n % 100 > 4 && n % 100 < 20 ? 2 : cases[Math.min(n % 10, 5)]];
};

/** URI и cacheKey логотипа — как в CourseCard (инвалидация кэша при смене файла обложки) */
function getTrainerCourseLogoCacheProps(
  course: Pick<PublicProfileCourse, "id" | "logoImg" | "updatedAt">,
): { logoCandidates: string[]; cacheKeyBase: string } {
  const logoImgUri = course.logoImg?.startsWith("/")
    ? `${API_BASE_URL.replace(/\/$/, "")}${course.logoImg}`
    : course.logoImg || undefined;
  const logoVersion =
    course.updatedAt != null ? new Date(course.updatedAt).getTime().toString() : "no-version";
  const logoImgVersionedUri = logoImgUri
    ? `${logoImgUri}${logoImgUri.includes("?") ? "&" : "?"}v=${logoVersion}`
    : undefined;
  const logoCandidates = getCourseLogoVariantCandidates(logoImgVersionedUri);
  const cacheKeyBase = `course-logo-${course.id}-${logoVersion}`;
  return { logoCandidates, cacheKeyBase };
}

function TrainerCourseLogoImage({
  course,
}: {
  course: Pick<PublicProfileCourse, "id" | "logoImg" | "updatedAt">;
}) {
  const { logoCandidates, cacheKeyBase } = useMemo(
    () => getTrainerCourseLogoCacheProps(course),
    [course],
  );
  const [logoCandidateIndex, setLogoCandidateIndex] = useState(0);
  const preferredLogoImgUri = logoCandidates[logoCandidateIndex];
  const hasNextLogoFallback = logoCandidateIndex < logoCandidates.length - 1;
  const logoCacheKey = `${cacheKeyBase}-${logoCandidateIndex}`;

  useEffect(() => {
    setLogoCandidateIndex(0);
  }, [cacheKeyBase]);

  return (
    <Image
      source={
        preferredLogoImgUri ? { uri: preferredLogoImgUri, cacheKey: logoCacheKey } : undefined
      }
      style={styles.courseImage}
      contentFit="cover"
      recyclingKey={logoCacheKey}
      transition={0}
      onError={() => {
        if (hasNextLogoFallback) {
          setLogoCandidateIndex((prev) => prev + 1);
        }
      }}
    />
  );
}

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

const getTrainingLevelLabel = (
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT",
): string => {
  switch (level) {
    case "BEGINNER":
      return "Начальный";
    case "INTERMEDIATE":
      return "Средний";
    case "ADVANCED":
      return "Продвинутый";
    case "EXPERT":
      return "Экспертный";
    default:
      return level;
  }
};

/** Guest reads remain available; authenticated requests must stay bound to a verified native epoch. */
function currentPublicSessionKey(): string | null {
  const state = useAuthStore.getState();
  if (state.isLoading) return null;
  if (!state.isAuthenticated) return "guest";
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  if (!state.user?.id || binding?.principalId !== state.user.id || !binding.authEpoch) return null;
  return `${state.user.id}:${binding.authEpoch}`;
}

/**
 * Страница публичного профиля пользователя
 */
export default function PublicProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ username: string }>();
  const username = typeof params.username === "string" ? params.username.trim() : "";
  // Subscribe to auth changes; native epoch is included in the cache key separately.
  const authVersion = useAuthStore(
    (state) => `${state.isLoading}:${state.isAuthenticated}:${state.user?.id ?? ""}`,
  );
  void authVersion;
  const sessionKey = currentPublicSessionKey();
  const mounted = useRef(true);
  const focused = useRef(true);
  const activeUsername = useRef(username);
  activeUsername.current = username;
  const courseAccessInFlight = useRef(false);
  const [openingChat, setOpeningChat] = useState(false);
  const currentView = (
    expectedUsername: string,
    expectedSession: string | null,
    requireFocus = true,
  ) =>
    mounted.current &&
    (!requireFocus || focused.current) &&
    !!expectedUsername &&
    activeUsername.current === expectedUsername &&
    !!expectedSession &&
    currentPublicSessionKey() === expectedSession;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      focused.current = false;
    };
  }, []);

  // Public endpoint is readable by guests, but even a delayed authorized GET
  // may not repopulate a different user's/epoch's query cache.
  const {
    data: publicData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["public-profile", username, sessionKey],
    enabled: !!username && !!sessionKey,
    retry: false,
    queryFn: async () => {
      const captured = { username, sessionKey };
      if (!currentView(captured.username, captured.sessionKey, false))
        throw new Error("PUBLIC_PROFILE_SESSION_CHANGED");
      const res = await userApi.getPublicProfile(captured.username, () =>
        currentView(captured.username, captured.sessionKey, false),
      );
      if (!currentView(captured.username, captured.sessionKey, false))
        throw new Error("PUBLIC_PROFILE_SESSION_CHANGED");
      if (!res.success || !res.data) throw new Error("PUBLIC_PROFILE_READ_UNKNOWN");
      const projected = projectPublicProfile(res.data);
      if (!projected) throw new Error("PUBLIC_PROFILE_INVALID_RESPONSE");
      return projected;
    },
  });

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      if (username && sessionKey) void refetch();
      return () => {
        focused.current = false;
      };
    }, [username, sessionKey, refetch]),
  );

  const contacts = publicContactLinks(publicData?.profile ?? null);
  const profile = publicData?.profile;
  const displayRole = getRoleLabel(publicData?.role);
  const roleColor = getRoleColor(publicData?.role);
  const rawBirth = profile?.birthDate;
  const birthDateStr =
    rawBirth == null ? null : typeof rawBirth === "string" ? rawBirth : String(rawBirth);
  const age = birthDateStr ? getAge(birthDateStr) : null;
  const hasSocialLinks = contacts.instagram || contacts.telegram || contacts.website;
  const rawTrainerCourses = publicData?.role === "TRAINER" ? (publicData?.courses ?? []) : [];
  const courses = rawTrainerCourses;

  if (isLoading || (!!username && !sessionKey)) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Stack.Screen options={{ title: "Загрузка..." }} />
        <AppBackButton style={styles.backRow} onPress={() => router.back()} />
        <Loading fullScreen embedded message="Загрузка профиля..." />
      </SafeAreaView>
    );
  }

  if (!publicData) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Stack.Screen options={{ title: "Профиль не найден" }} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            {isError ? "Не удалось загрузить профиль" : "Профиль не найден"}
          </Text>
          <AppBackButton onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const handleMessagePress = async () => {
    const captured = { username, sessionKey };
    if (openingChat || sessionKey === "guest" || !currentView(captured.username, captured.sessionKey)) return;
    setOpeningChat(true);
    try {
      const { conversationId } = await chat2.directByUsername(publicData.username);
      if (!currentView(captured.username, captured.sessionKey)) return;
      router.push({ pathname: "/(main)/chats/[id]", params: { id: conversationId } } as Href);
    } catch (error) {
      reportClientError(new Error("CHAT2_PUBLIC_PROFILE_DIRECT_FAILED"), {
        issueKey: "PublicProfile",
        keys: { operation: "open_direct" },
      });
      if (currentView(captured.username, captured.sessionKey)) {
        Alert.alert(
          "Не удалось открыть переписку",
          error instanceof Error ? error.message : "Повторите попытку",
        );
      }
    } finally {
      if (currentView(captured.username, captured.sessionKey, false)) setOpeningChat(false);
    }
  };

  const handleCoursePress = async (course: PublicProfileCourse) => {
    const captured = { username, sessionKey };
    if (!currentView(captured.username, captured.sessionKey) || courseAccessInFlight.current)
      return;
    if (course.isPrivate) {
      // Private course access is always an authenticated, verified-owner decision.
      if (!sessionKey || sessionKey === "guest") {
        Alert.alert("Доступ закрыт", "Войдите, чтобы проверить доступ к курсу");
        return;
      }
      courseAccessInFlight.current = true;
      try {
        const accessRes = await coursesApi.checkAccess(course.type, () =>
          currentView(captured.username, captured.sessionKey),
        );
        if (!currentView(captured.username, captured.sessionKey)) return;
        if (!accessRes.success || !accessRes.data) {
          Alert.alert("Не удалось проверить доступ", "Повторите проверку позднее");
          return;
        }
        if (!accessRes.data.hasAccess) {
          Alert.alert(
            "Доступ закрыт",
            "Этот курс для вас закрыт. Обратитесь к кинологу для получения доступа",
          );
          return;
        }
      } catch {
        // Native transport may contain tokens: never report raw errors or URLs.
        reportClientError(new Error("PUBLIC_PRIVATE_COURSE_ACCESS_UNKNOWN"), {
          issueKey: "PublicProfile",
          keys: { operation: "check_course_access" },
        });
        if (currentView(captured.username, captured.sessionKey))
          Alert.alert("Не удалось проверить доступ", "Повторите проверку позднее");
        return;
      } finally {
        courseAccessInFlight.current = false;
      }
    }
    if (!currentView(captured.username, captured.sessionKey)) return;
    router.push({
      pathname: "/training/[courseType]",
      params: { courseType: course.type },
    });
  };

  const openContact = (uri: string) => {
    const captured = { username, sessionKey };
    if (!currentView(captured.username, captured.sessionKey)) return;
    void Linking.openURL(uri).catch(() => {
      // Fixed error code only; do not put contacts or external URL in telemetry.
      reportClientError(new Error("PUBLIC_CONTACT_OPEN_FAILED"), {
        issueKey: "PublicProfile",
        keys: { operation: "open_contact" },
      });
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Stack.Screen options={{ title: profile?.fullName || publicData.username }} />
      <AppBackButton style={styles.backRow} onPress={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Compact public profile identity header, without a duplicate page title. */}
        <View style={styles.profileBanner}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatarWrapper}>
              <Image
                source={
                  profile?.avatarUrl
                    ? { uri: profile.avatarUrl }
                    : require("../../../assets/images/avatar.png")
                }
                style={styles.avatarImage}
                contentFit="cover"
              />
            </View>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.greeting} numberOfLines={2}>
              {profile?.fullName || publicData.username}
            </Text>
            <View style={styles.profileMeta}>
              <Text style={styles.contactInfo} numberOfLines={1}>
                @{contacts.telegram?.name || publicData.username}
              </Text>
              {displayRole && (
                <View style={[styles.roleBadge, { backgroundColor: roleColor }]}>
                  <Text style={styles.roleText}>{displayRole}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {sessionKey && sessionKey !== "guest" &&
          useAuthStore.getState().user?.username?.toLowerCase() !==
            publicData.username.toLowerCase() &&
          publicData.username.toLowerCase() !== "lana" &&
          /^[A-Za-z0-9_-]{2,128}$/.test(publicData.username) && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Написать сообщение"
              disabled={openingChat}
              onPress={() => void handleMessagePress()}
              style={[styles.messageButton, openingChat && styles.messageButtonBusy]}
            >
              <MaterialCommunityIcons name="message-text-outline" size={19} color="#fff" />
              <Text style={styles.messageButtonText}>
                {openingChat ? "Открываем переписку…" : "Написать сообщение"}
              </Text>
            </Pressable>
          )}

        {/* Информация о пользователе */}
        <View style={styles.infoContainer}>
          <ProfileMetaRow
            city={profile?.city}
            ageLabel={
              age !== null ? `Возраст: ${age} ${declOfNum(age, ["год", "года", "лет"])}` : null
            }
          />

          {/* О себе */}
          {profile?.about && (
            <View style={styles.aboutContainer}>
              <View style={styles.socialHeading}>
                <ProfileIcon name="about" />
                <Text style={styles.aboutTitle}>О СЕБЕ</Text>
              </View>
              <View style={styles.aboutCard}>
                <Text style={styles.aboutText}>{profile.about}</Text>
              </View>
            </View>
          )}

          <PublicPets pets={publicData.pets ?? []} />
          <GalleryPreview owner={publicData?.username ?? username} showHeadingIcon />
          <ProfileFeedPreview username={publicData?.username ?? username} />

          {/* Социальные сети */}
          {hasSocialLinks && profile && (
            <View style={styles.socialLinksContainer}>
              <View style={styles.socialHeading}>
                <ProfileIcon name="contacts" />
                <Text style={styles.socialLinksTitle}>КОНТАКТЫ</Text>
              </View>
              <View style={styles.socialLinksList}>
                {contacts.instagram && (
                  <Pressable
                    style={styles.socialLink}
                    onPress={() => contacts.instagram && openContact(contacts.instagram.url)}
                  >
                    <FontAwesome5
                      name="instagram"
                      brand
                      size={22}
                      color="#C13584"
                      style={styles.socialBrandIcon}
                    />
                    <Text style={styles.socialLabel}>Instagram</Text>
                    <Text style={styles.socialUsername}>{contacts.instagram.name}</Text>
                  </Pressable>
                )}
                {contacts.telegram && (
                  <Pressable
                    style={styles.socialLink}
                    onPress={() => contacts.telegram && openContact(contacts.telegram.url)}
                  >
                    <FontAwesome5
                      name="telegram-plane"
                      brand
                      size={22}
                      color="#229ED9"
                      style={styles.socialBrandIcon}
                    />
                    <Text style={styles.socialLabel}>Телеграм</Text>
                    <Text style={styles.socialUsername}>{contacts.telegram.name}</Text>
                  </Pressable>
                )}
                {contacts.website && (
                  <Pressable
                    style={styles.socialLink}
                    onPress={() => contacts.website && openContact(contacts.website.url)}
                  >
                    <MaterialCommunityIcons
                      name="web"
                      size={24}
                      color="#636128"
                      style={styles.socialBrandIcon}
                    />
                    <Text style={styles.socialLabel}>Сайт</Text>
                    <Text style={styles.socialUsername}>{contacts.website.name}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}
        </View>

        {/* Курсы кинолога — дизайн как на web (TrainerCoursesSection) */}
        {courses.length > 0 && (
          <View style={styles.coursesSection}>
            <Text style={styles.coursesSectionTitle}>Курсы кинолога</Text>
            <View style={styles.coursesList}>
              {courses.map((course) => {
                return (
                  <Pressable
                    key={course.id}
                    style={({ pressed }) => [
                      styles.courseItem,
                      pressed && styles.courseItemPressed,
                    ]}
                    onPress={() => handleCoursePress(course)}
                  >
                    <View style={styles.courseContent}>
                      <View style={styles.imageWrapper}>
                        <TrainerCourseLogoImage course={course} />
                        {course.isPrivate && (
                          <View style={styles.privateBadge}>
                            <Text style={styles.privateBadgeText}>Приватный</Text>
                          </View>
                        )}
                        {course.isPaid && (
                          <View style={styles.paidBadge}>
                            <Text style={styles.paidBadgeText}>По подписке</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.courseInfo}>
                        <Text style={styles.courseName}>{course.name}</Text>
                        {course.shortDesc ? (
                          <Text style={styles.courseDescription}>{course.shortDesc}</Text>
                        ) : null}
                        <View style={styles.courseMeta}>
                          <Text style={styles.courseMetaText}>
                            <Text style={styles.courseMetaLabel}>Длительность:</Text>{" "}
                            {course.duration}
                          </Text>
                          <Text style={styles.courseMetaText}>
                            <Text style={styles.courseMetaLabel}>Уровень:</Text>{" "}
                            {getTrainingLevelLabel(course.trainingLevel)}
                          </Text>
                          {course.avgRating != null && (
                            <Text style={styles.courseMetaText}>
                              <Text style={styles.courseMetaLabel}>Рейтинг:</Text>{" "}
                              {course.avgRating.toFixed(1)} ♥
                            </Text>
                          )}
                        </View>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
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
    paddingHorizontal: SPACING.md,
    paddingTop: 4,
    paddingBottom: SPACING.md,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  errorText: {
    fontSize: 16,
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
    marginBottom: SPACING.md,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    minHeight: 42,
    paddingVertical: 4,
    gap: 4,
  },
  backRowText: {
    fontSize: 15,
    color: COLORS.primary,
    fontWeight: "500",
    fontFamily: FONTS.montserrat,
  },
  messageButton: {
    minHeight: 46,
    backgroundColor: "#4B5C2E",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 14,
  },
  messageButtonBusy: { opacity: 0.7 },
  messageButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    fontFamily: FONTS.montserratMedium,
  },
  profileBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
    backgroundColor: "#636128",
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  avatarContainer: {
    flexShrink: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarWrapper: {
    width: 58,
    height: 58,
    borderRadius: 29,
    overflow: "hidden",
    backgroundColor: COLORS.primary,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
    flexDirection: "column",
    gap: 3,
  },
  greeting: {
    fontSize: 16,
    color: "#ECE5D2",
    fontFamily: FONTS.montserratMedium,
    lineHeight: 21,
  },
  profileMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 8,
    rowGap: 3,
  },
  contactInfo: {
    fontSize: 12,
    color: "#D4C4A8",
    fontFamily: FONTS.montserrat,
    flexShrink: 1,
  },
  roleBadge: {
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 7,
    alignSelf: "flex-start",
  },
  roleText: {
    color: "#ECE5D2",
    fontSize: 10,
    fontFamily: FONTS.montserratMedium,
  },
  infoContainer: {
    width: "100%",
    padding: SPACING.md,
    backgroundColor: COLORS.cardBackground,
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
    marginBottom: 0,
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
  socialLinksContainer: {
    width: "100%",
    marginTop: SPACING.md,
    backgroundColor: "#FFFAF0",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(77, 92, 45, 0.22)",
    paddingTop: 14,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    shadowColor: "#352E2E",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  socialHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: SPACING.sm,
  },
  socialLinksTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#352E2E",
    marginBottom: 0,
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
  socialBrandIcon: {
    width: 28,
    textAlign: "center",
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
  // Курсы кинолога — как TrainerCoursesSection на web
  coursesSection: {
    width: "100%",
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    padding: SPACING.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  coursesSectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#352E2E",
    marginBottom: SPACING.md,
    fontFamily: FONTS.impact,
  },
  coursesList: {
    gap: SPACING.md,
  },
  courseItem: {
    backgroundColor: "#ECE5D2",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  courseItemPressed: {
    opacity: 0.9,
  },
  courseContent: {
    flexDirection: "column",
    padding: 16,
    gap: 12,
  },
  imageWrapper: {
    width: "100%",
    height: 140,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#636128",
    backgroundColor: COLORS.cardBackground,
    position: "relative",
  },
  courseImage: {
    width: "100%",
    height: "100%",
    borderRadius: 0,
  },
  privateBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(220, 53, 69, 0.9)",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  privateBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
  },
  paidBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "rgba(40, 120, 80, 0.9)",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  paidBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
  },
  courseInfo: {
    flexDirection: "column",
    gap: 8,
  },
  courseName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#352E2E",
    fontFamily: FONTS.impact,
    textAlign: "left",
  },
  courseDescription: {
    fontSize: 14,
    color: "#352E2E",
    lineHeight: 20,
    fontFamily: FONTS.montserrat,
    textAlign: "left",
  },
  courseMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  courseMetaText: {
    fontSize: 13,
    color: "#636128",
    fontFamily: FONTS.montserrat,
  },
  courseMetaLabel: {
    fontWeight: "600",
    color: "#636128",
    fontFamily: FONTS.montserrat,
  },
});
