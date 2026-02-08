import { View, StyleSheet, ScrollView, Pressable, Linking } from "react-native";
import { Text, Avatar } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";

import { userApi, type PublicProfileCourse } from "@/shared/lib/api/user";
import { coursesApi } from "@/shared/lib/api/courses";
import { COLORS, SPACING, FONTS } from "@/constants";

// Функция для получения инициалов
const getInitials = (name: string): string => {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

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
  } catch {
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
    case "PREMIUM":
      return "Премиум-пользователь";
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
    case "PREMIUM":
      return "#B6C582";
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

/**
 * Страница публичного профиля пользователя
 */
export default function PublicProfileScreen() {
  const router = useRouter();
  const { username } = useLocalSearchParams<{ username: string }>();

  // Загрузка публичного профиля
  const { data: profileResponse, isLoading } = useQuery({
    queryKey: ["public-profile", username],
    queryFn: () => userApi.getPublicProfile(username as string),
    enabled: !!username,
  });

  const publicData = profileResponse?.data;
  const profile = publicData?.profile;
  const displayRole = getRoleLabel(publicData?.role);
  const roleColor = getRoleColor(publicData?.role);
  const rawBirth = profile?.birthDate;
  const birthDateStr =
    rawBirth == null ? null : typeof rawBirth === "string" ? rawBirth : String(rawBirth);
  const age = birthDateStr ? getAge(birthDateStr) : null;
  const hasSocialLinks =
    profile?.instagram || profile?.telegram || profile?.website;
  const courses = publicData?.role === "TRAINER" ? publicData?.courses ?? [] : [];

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Stack.Screen options={{ title: "Загрузка..." }} />
        <Pressable style={styles.backRow} onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={COLORS.primary} />
          <Text style={styles.backRowText}>Назад</Text>
        </Pressable>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Загрузка профиля...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!publicData) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Stack.Screen options={{ title: "Профиль не найден" }} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Профиль не найден</Text>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Назад</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const handleCoursePress = async (course: PublicProfileCourse) => {
    if (course.isPaid) {
      router.push({
        pathname: "/training/[courseType]",
        params: { courseType: course.type },
      });
      return;
    }
    if (course.isPrivate) {
      const accessRes = await coursesApi.checkAccess(course.type);
      if (!accessRes.success || !accessRes.data?.hasAccess) {
        const { Alert } = await import("react-native");
        Alert.alert(
          "Доступ закрыт",
          "Этот курс для вас закрыт. Обратитесь к кинологу для получения доступа",
        );
        return;
      }
    }
    router.push({
      pathname: "/training/[courseType]",
      params: { courseType: course.type },
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Stack.Screen options={{ title: `Профиль ${publicData.username}` }} />
      <Pressable
        style={styles.backRow}
        onPress={() => router.back()}
        hitSlop={12}
      >
        <MaterialCommunityIcons name="chevron-left" size={28} color={COLORS.primary} />
        <Text style={styles.backRowText}>Назад</Text>
      </Pressable>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Профиль {publicData.username}</Text>

        {/* Баннер профиля */}
        <View style={styles.profileBanner}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatarWrapper}>
              {profile?.avatarUrl ? (
                <Avatar.Image size={95} source={{ uri: profile.avatarUrl }} />
              ) : (
                <Avatar.Image
                  size={95}
                  source={require("../../../assets/images/avatar.png")}
                />
              )}
            </View>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.greeting}>
              {profile?.fullName || publicData.username}
            </Text>
            {profile?.telegram && (
              <Text style={styles.contactInfo}>@{profile.telegram}</Text>
            )}
            {displayRole && (
              <View style={[styles.roleBadge, { backgroundColor: roleColor }]}>
                <Text style={styles.roleText}>{displayRole}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Информация о пользователе */}
        <View style={styles.infoContainer}>
          {age !== null && (
            <Text style={styles.infoText}>
              Возраст: {age} {declOfNum(age, ["год", "года", "лет"])}
            </Text>
          )}

          {/* О себе */}
          {profile?.about && (
            <View style={styles.aboutContainer}>
              <Text style={styles.aboutTitle}>О СЕБЕ</Text>
              <View style={styles.aboutCard}>
                <Text style={styles.aboutText}>{profile.about}</Text>
              </View>
            </View>
          )}

          {/* Социальные сети */}
          {hasSocialLinks && profile && (
            <View style={styles.socialLinksContainer}>
              <Text style={styles.socialLinksTitle}>КОНТАКТЫ</Text>
              <View style={styles.socialLinksList}>
                {profile.instagram && (
                  <Pressable
                    style={styles.socialLink}
                    onPress={() =>
                      Linking.openURL(
                        `https://instagram.com/${profile.instagram}`,
                      )
                    }
                  >
                    <Text style={styles.socialIcon}>📷</Text>
                    <Text style={styles.socialLabel}>Instagram</Text>
                    <Text style={styles.socialUsername}>
                      {profile.instagram}
                    </Text>
                  </Pressable>
                )}
                {profile.telegram && (
                  <Pressable
                    style={styles.socialLink}
                    onPress={() =>
                      Linking.openURL(`https://t.me/${profile.telegram}`)
                    }
                  >
                    <Text style={styles.socialIcon}>✈️</Text>
                    <Text style={styles.socialLabel}>Telegram</Text>
                    <Text style={styles.socialUsername}>{profile.telegram}</Text>
                  </Pressable>
                )}
                {profile.website && (
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
        </View>

        {/* Курсы кинолога — дизайн как на web (TrainerCoursesSection) */}
        {courses.length > 0 && (
          <View style={styles.coursesSection}>
            <Text style={styles.coursesSectionTitle}>Курсы кинолога</Text>
            <View style={styles.coursesList}>
              {courses.map((course) => (
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
                      <Image
                        source={{
                          uri: course.logoImg || undefined,
                        }}
                        style={styles.courseImage}
                        contentFit="cover"
                      />
                      {course.isPrivate && (
                        <View style={styles.privateBadge}>
                          <Text style={styles.privateBadgeText}>Приватный</Text>
                        </View>
                      )}
                      {course.isPaid && (
                        <View style={styles.paidBadge}>
                          <Text style={styles.paidBadgeText}>Платный</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.courseInfo}>
                      <Text style={styles.courseName}>{course.name}</Text>
                      {course.shortDesc ? (
                        <Text style={styles.courseDescription}>
                          {course.shortDesc}
                        </Text>
                      ) : null}
                      <View style={styles.courseMeta}>
                        {course.isPaid &&
                          course.priceRub != null &&
                          course.priceRub > 0 && (
                            <Text style={styles.courseMetaText}>
                              <Text style={styles.courseMetaLabel}>Цена:</Text>{" "}
                              {course.priceRub} ₽
                            </Text>
                          )}
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
              ))}
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
    padding: SPACING.md,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
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
    paddingVertical: SPACING.sm,
    gap: 4,
  },
  backRowText: {
    fontSize: 17,
    color: COLORS.primary,
    fontWeight: "500",
    fontFamily: FONTS.montserrat,
  },
  backButton: {
    backgroundColor: "#636128",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  backButtonText: {
    color: "#ECE5D2",
    fontSize: 15,
    fontWeight: "600",
    fontFamily: FONTS.impact,
  },
  title: {
    fontSize: 28,
    fontWeight: "400",
    color: "#352E2E",
    textAlign: "center",
    marginBottom: SPACING.md,
    fontFamily: FONTS.impact,
  },
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
    flexShrink: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarWrapper: {
    width: 105,
    height: 105,
    borderRadius: 53,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
    backgroundColor: COLORS.primary,
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
  // Курсы кинолога — как TrainerCoursesSection на web
  coursesSection: {
    width: "100%",
    marginBottom: SPACING.lg,
    backgroundColor: "#F5F0E8",
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
    backgroundColor: "#FFF8E5",
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
